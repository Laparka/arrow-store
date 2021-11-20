import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBFilterExpressionTransformer} from "../parser/filterExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import FilterExpressionParser from "../parser/filterExpressionParser";
import UpdateExpressionParser from "../parser/updateExpressionParser";
import {DynamoDBUpdateExpressionTransformer} from "../parser/updateExpressionTransformer";
import {ExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBDestroyExpressionTransformer} from "../parser/destroyExpressionTransformer";
import {AttributeValue, UpdateItemInput} from "aws-sdk/clients/dynamodb";

export type UpdateBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord>,
    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>,
    destroy<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};

export class DynamoDBUpdateBuilder<TRecord extends DynamoDBRecord> implements UpdateBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _filterTransformer: ExpressionTransformer;
    private readonly _updateTransformer: ExpressionTransformer;
    private readonly _destroyTransformer: ExpressionTransformer;
    private readonly _conditionExpressions: string[];
    private readonly _updateExpressions: Map<string, string[]>;

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver)
    {
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._filterTransformer = new DynamoDBFilterExpressionTransformer("conditionParam");
        this._updateTransformer = new DynamoDBUpdateExpressionTransformer("updateParam");
        this._destroyTransformer = new DynamoDBDestroyExpressionTransformer();
        this._conditionExpressions = [];
        this._updateExpressions = new Map<string, string[]>();
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!predicate) {
            throw Error(`The condition expression is missing`);
        }

        const query = predicate.toString();
        if (!query) {
            throw Error(`The expression string is missing`);
        }

        if (!this._recordId || !this._recordId.getRecordTypeId) {
            throw Error(`The record ID or the getRecordTypeId function is not available`);
        }

        const typeId = this._recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing`);
        }

        const tokens = LambdaPredicateLexer.Instance.tokenize(query);
        const expression = FilterExpressionParser.Instance.parse(query, tokens);
        const readingSchema = this._schemaProvider.getReadingSchema(this._recordId.getRecordTypeId());
        this._conditionExpressions.push(this._filterTransformer.transform(readingSchema, expression, parametersMap));
        return this;
    }

    destroy<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The delete expression is missing`);
        }

        const deleteQuery = expression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(deleteQuery);
        const node = UpdateExpressionParser.Instance.parse(deleteQuery, tokens);
        const writingSchema = this._schemaProvider.getWritingSchema(this._recordId.getRecordTypeId());
        const destroyExp = this._destroyTransformer.transform(writingSchema, node);
        let removeExps = this._updateExpressions.get("REMOVE");
        if (!removeExps) {
            removeExps = [];
            this._updateExpressions.set("REMOVE", removeExps);
        }

        removeExps.push(destroyExp);
        return this;
    }

    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The update expression is missing`);
        }

        const updateQuery = expression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(updateQuery);
        const node = UpdateExpressionParser.Instance.parse(updateQuery, tokens);
        const writingSchema = this._schemaProvider.getWritingSchema(this._recordId.getRecordTypeId());
        const updateExp = this._updateTransformer.transform(writingSchema, node, parametersMap);
        if (updateExp) {
            let group: string[];
            let startIndex;
            if (updateExp.startsWith('SET ')) {
                let setGroup = this._updateExpressions.get("SET");
                if (!setGroup) {
                    setGroup = [];
                    this._updateExpressions.set("SET", setGroup);
                }

                startIndex = 4;
                group = setGroup;
            }
            else if (updateExp.startsWith("REMOVE ")) {
                let removeGroup = this._updateExpressions.get("REMOVE");
                if (!removeGroup) {
                    removeGroup = [];
                    this._updateExpressions.set("REMOVE", removeGroup);
                }

                startIndex = 7;
                group = removeGroup;
            }
            else {
                throw Error(`Not supported expression ${updateExp}`);
            }

            group.push(updateExp.slice(startIndex, updateExp.length));
        }

        return this;
    }

    async executeAsync(): Promise<boolean> {
        const client = this._clientResolver.resolve();
        const updateInput: UpdateItemInput = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            ReturnValues: "NONE",
            TableName: this._recordId.getTableName()
        };

        const updateExp: string[] = [];
        if (this._updateExpressions.size !== 0) {
            this._updateExpressions.forEach((value, key) => {
                updateExp.push(`${key} ${value.join(', ')}`);
            });

            this._populateAttributeValues(updateInput, this._updateTransformer.getExpressionAttributeValues());
        }

        if (updateExp.length !== 0) {
            updateInput.UpdateExpression = updateExp.join(' ');
        }
        if (this._conditionExpressions.length === 1) {
            updateInput.ConditionExpression = this._conditionExpressions[0];
        }
        else if (this._conditionExpressions.length > 1) {
            updateInput.ConditionExpression = this._conditionExpressions.map(x => `(${x})`).join(' AND ');
        }

        this._populateAttributeValues(updateInput, this._filterTransformer.getExpressionAttributeValues());
        const response = await client.updateItem(updateInput).promise();
        return response?.$response?.httpResponse?.statusCode === 200;
    }

    private _populateAttributeValues(updateInput: UpdateItemInput, expressionAttributeValues: ReadonlyMap<string, AttributeValue>) {
        if (expressionAttributeValues.size === 0) {
            return;
        }

        if (!updateInput.ExpressionAttributeValues) {
            updateInput.ExpressionAttributeValues = {};
        }

        expressionAttributeValues.forEach((value, key) => updateInput.ExpressionAttributeValues![key] = value);
    }
}
