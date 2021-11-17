import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBFilterExpressionTransformer} from "../parser/filterExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import FilterExpressionParser from "../parser/filterExpressionParser";
import {UpdateItemInput} from "aws-sdk/clients/dynamodb";

export interface UpdateBuilder<TRecord extends DynamoDBRecord> {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord>;
    executeAsync(): Promise<boolean>;
    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>;
    delete<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord>;
    add<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>;
}


export class DynamoDBUpdateBuilder<TRecord extends DynamoDBRecord> implements UpdateBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _expressionTransformer: DynamoDBFilterExpressionTransformer;
    private readonly _conditionExpressions: string[];
    private readonly _updateExpressions: string[];

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver)
    {
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._expressionTransformer = new DynamoDBFilterExpressionTransformer("updateParam");
        this._conditionExpressions = [];
        this._updateExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!predicate) {
            throw Error(`The condition expression is missing`);
        }

        this._conditionExpressions.push(this._toExpression(predicate.toString(), parametersMap));
        return this;
    }

    add<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        return this;
    }

    delete<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord> {
        return this;
    }

    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The update expression is missing`);
        }

        this._updateExpressions.push(this._toExpression(expression.toString(), parametersMap));
        return this;
    }

    async executeAsync(): Promise<boolean> {
        if (!this._recordId || !this._recordId.getPrimaryKeys || !this._recordId.getTableName) {
            throw Error(`The record ID is missing or does not return required parameters`);
        }

        const updateRequest: UpdateItemInput = {
            TableName: this._recordId.getTableName(),
            ReturnValues: "NONE",
            ReturnConsumedCapacity: "TOTAL",
            ReturnItemCollectionMetrics: "NONE",
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys())
        };

        if (this._updateExpressions.length === 0) {
            return false;
        }
        else {
            updateRequest.UpdateExpression = this._updateExpressions.map(exp => `SET ${exp}`).join('; ');
        }

        const client = this._clientResolver.resolve();

        if (this._conditionExpressions.length === 1) {
            updateRequest.ConditionExpression = this._conditionExpressions[0];
        }
        else if (this._conditionExpressions.length > 1) {
            updateRequest.ConditionExpression = this._conditionExpressions.map(condition => `(${condition})`).join(' AND ');
        }

        this._expressionTransformer.expressionAttributeValues.forEach((value, key) => {
            if (!updateRequest.ExpressionAttributeValues) {
                updateRequest.ExpressionAttributeValues = {};
            }

            updateRequest.ExpressionAttributeValues[key] = value;
        });

        const updateResponse = await client.updateItem(updateRequest).promise()
        return updateResponse.$response?.httpResponse?.statusCode === 200;
        return true;
    }

    private _toExpression(query: string, parametersMap?: any): string {
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
        return this._expressionTransformer.transform(readingSchema, expression, parametersMap);
    }
}
