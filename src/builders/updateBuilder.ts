import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {WhereCauseExpressionTransformer} from "../transformers/whereCauseExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import UpdateExpressionParser from "../parser/updateExpressionParser";
import {UpdateExpressionTransformer} from "../transformers/updateExpressionTransformer";
import {ExpressionAttribute, ExpressionTransformer} from "../transformers/expressionTransformer";
import {AttributeValue, UpdateItemInput} from "aws-sdk/clients/dynamodb";
import {SetWhenNotExistsExpression} from "../parser/nodes";

export type UpdateBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord>,
    update<TContext>(updateExpression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>,
    updateWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>,
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
    private readonly _conditionExpressions: string[];
    private readonly _updateExpressions: Map<string, string[]>;

    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeValues: Map<string, AttributeValue>;

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver)
    {
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._attributeNames = new Map<string, string>();
        this._attributeValues = new Map<string, AttributeValue>();
        const attributeNameAliases = new Map<string, ExpressionAttribute>();
        const attributeValueAliases = new Map<string, string>();
        this._filterTransformer = new WhereCauseExpressionTransformer("attr_name",
            this._attributeNames,
            attributeNameAliases,
            this._attributeValues,
            attributeValueAliases);
        this._updateTransformer = new UpdateExpressionTransformer("attr_name",
            this._attributeNames,
            attributeNameAliases,
            this._attributeValues,
            attributeValueAliases);
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
        const expression = WhereCauseExpressionParser.Instance.parse(query, tokens);
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
        const destroyExp = this._updateTransformer.transform(writingSchema, node);
        let removeExps = this._updateExpressions.get("REMOVE");
        if (!removeExps) {
            removeExps = [];
            this._updateExpressions.set("REMOVE", removeExps);
        }

        removeExps.push(destroyExp);
        return this;
    }

    updateWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!member) {
            throw Error(`The member is missing`);
        }

        const memberAccessor = member.toString();
        const updateAccessor = updateExpression.toString();

        const memberAccessorExprTokens = LambdaPredicateLexer.Instance.tokenize(memberAccessor);
        const updateAccessorTokens = LambdaPredicateLexer.Instance.tokenize(updateAccessor);

        const memberExpr = UpdateExpressionParser.Instance.parse(memberAccessor, memberAccessorExprTokens);
        const updateExpr = UpdateExpressionParser.Instance.parse(updateAccessor, updateAccessorTokens);

        const ifNotExistsExpr = new SetWhenNotExistsExpression(memberExpr, updateExpr);
        const writingSchema = this._schemaProvider.getWritingSchema(this._recordId.getRecordTypeId());
        const updateExp = this._updateTransformer.transform(writingSchema, ifNotExistsExpr, parametersMap);
        this.addExpression(updateExp);
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
        this.addExpression(updateExp);
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

        if (this._attributeNames.size !== 0) {
            updateInput.ExpressionAttributeNames = {};
            const iterator = this._attributeNames.keys();
            let attributeName = iterator.next();
            while(!attributeName.done) {
                updateInput.ExpressionAttributeNames[this._attributeNames.get(attributeName.value)!] = attributeName.value;
                attributeName = iterator.next();
            }
        }

        if (this._attributeValues.size !== 0) {
            updateInput.ExpressionAttributeValues = {};
            const iterator = this._attributeValues.keys();
            let attributeValueRef = iterator.next();
            while(!attributeValueRef.done) {
                updateInput.ExpressionAttributeValues[attributeValueRef.value] = this._attributeValues.get(attributeValueRef.value)!;
                attributeValueRef = iterator.next();
            }
        }

        const response = await client.updateItem(updateInput).promise();
        return response?.$response?.httpResponse?.statusCode === 200;
    }

    private addExpression(updateExp: string) {
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
        else if (updateExp.startsWith("ADD ")) {
            let addGroup = this._updateExpressions.get("ADD");
            if (!addGroup) {
                addGroup = [];
                this._updateExpressions.set("ADD", addGroup);
            }

            startIndex = 4;
            group = addGroup;
        }
        else {
            throw Error(`Not supported expression ${updateExp}`);
        }

        group.push(updateExp.slice(startIndex, updateExp.length));
    }
}
