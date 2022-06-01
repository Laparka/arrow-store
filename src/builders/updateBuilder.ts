import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import UpdateExpressionParser from "../parser/updateExpressionParser";
import {UpdateExpressionTransformer} from "../transformers/updateExpressionTransformer";
import { ExpressionTransformer} from "../transformers/expressionTransformer";
import {Update, UpdateItemInput} from "aws-sdk/clients/dynamodb";
import {SetWhenNotExistsExpression} from "../parser/nodes";
import {joinFilterExpressions, setExpressionAttributes} from "./utils";
import {WhenExpressionBuilder} from "./batchWriteBuilder";

export type TransactUpdateItemBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): TransactUpdateItemBuilder<TRecord>,
    set<TContext>(updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): TransactUpdateItemBuilder<TRecord>,
    setWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): TransactUpdateItemBuilder<TRecord>,
    destroy<TMember>(expression: (record: TRecord) => TMember): TransactUpdateItemBuilder<TRecord>,
};

export type UpdateBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): UpdateBuilder<TRecord>,
    set<TContext>(updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): UpdateBuilder<TRecord>,
    setWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): UpdateBuilder<TRecord>,
    destroy<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};

class UpdateItemBuilder<TRecord extends DynamoDBRecord> extends WhenExpressionBuilder<TRecord> {
    private readonly _updateTransformer: ExpressionTransformer;
    private readonly _conditionExpressions: string[];
    private readonly _updateExpressions: Map<string, string[]>;
    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper) {
        super(recordId, schemaProvider, recordMapper);

        this._conditionExpressions = [];
        this._updateExpressions = new Map<string, string[]>();
        this._updateTransformer = new UpdateExpressionTransformer("attr_name",
            this.attributeNames,
            this.attributeNameAliases,
            this.attributeValues,
            this.attributeValueAliases);
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): void {
        this._conditionExpressions.push(this.toWhereExpression(predicate, context));
    }

    set<TContext>(updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): void {
        if (!updateExpression) {
            throw Error(`The update expression is missing`);
        }

        const updateQuery = updateExpression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(updateQuery);
        const node = UpdateExpressionParser.Instance.parse(updateQuery, tokens);
        const writingSchema = this._schemaProvider.getWritingSchema(this._recordId.getRecordTypeId());
        const updateExp = this._updateTransformer.transform(writingSchema, node, context);
        this._addExpression(updateExp);
    }

    setWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext):void {
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
        const updateExp = this._updateTransformer.transform(writingSchema, ifNotExistsExpr, context);
        this._addExpression(updateExp);
    }

    destroy<TMember>(expression: (record: TRecord) => TMember): void {
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
    }

    private _addExpression(updateExp: string) {
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

    buildUpdateExpression() : string | undefined {
        const updateExp: string[] = [];
        if (this._updateExpressions.size !== 0) {
            this._updateExpressions.forEach((value, key) => {
                updateExp.push(`${key} ${value.join(', ')}`);
            });
        }

        if (updateExp.length !== 0) {
            return updateExp.join(' ');
        }

        return undefined;
    }

    buildConditionExpressions() : string | undefined {
        return joinFilterExpressions(this._conditionExpressions);
    }
}

export class DynamoDBTransactUpdateItemBuilder<TRecord extends DynamoDBRecord> implements TransactUpdateItemBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _updateExpressionBuilder: UpdateItemBuilder<TRecord>;

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper)
    {
        this._recordId = recordId;
        this._recordMapper = recordMapper;
        this._updateExpressionBuilder = new UpdateItemBuilder(recordId, schemaProvider, recordMapper);
    }

    destroy<TMember>(expression: (record: TRecord) => TMember): TransactUpdateItemBuilder<TRecord> {
        this._updateExpressionBuilder.destroy(expression);
        return this;
    }

    set<TContext>(updateExpression: (record: TRecord, context: TContext) => unknown, context: TContext | undefined): TransactUpdateItemBuilder<TRecord> {
        this._updateExpressionBuilder.set(updateExpression, context);
        return this;
    }

    setWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, context: TContext | undefined): TransactUpdateItemBuilder<TRecord> {
        this._updateExpressionBuilder.setWhenNotExists(member, updateExpression, context);
        return this;
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context: TContext | undefined): TransactUpdateItemBuilder<TRecord> {
        this._updateExpressionBuilder.when(predicate, context);
        return this;
    }

    build(): Update {
        const updateExpr = this._updateExpressionBuilder.buildUpdateExpression();
        if (!updateExpr) {
            throw Error(`No update expression was generated`);
        }

        const update: Update = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            TableName: this._recordId.getTableName(),
            ReturnValuesOnConditionCheckFailure: "NONE",
            UpdateExpression: updateExpr,
            ConditionExpression: this._updateExpressionBuilder.buildConditionExpressions()
        };

        setExpressionAttributes(this._updateExpressionBuilder.attributeNames, this._updateExpressionBuilder.attributeValues, update);
        return update;
    }
}

export class DynamoDBUpdateBuilder<TRecord extends DynamoDBRecord> implements UpdateBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _updateExpressionBuilder: UpdateItemBuilder<TRecord>;

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver)
    {
        this._recordId = recordId;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._updateExpressionBuilder = new UpdateItemBuilder(recordId, schemaProvider, recordMapper);
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): UpdateBuilder<TRecord> {
        this._updateExpressionBuilder.when(predicate, context);
        return this;
    }

    destroy<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord> {
        this._updateExpressionBuilder.destroy(expression);
        return this;
    }

    setWhenNotExists<TContext>(member: (record: TRecord) => unknown, updateExpression: (record: TRecord, context: TContext) => unknown, context?: TContext): UpdateBuilder<TRecord> {
        this._updateExpressionBuilder.setWhenNotExists(member, updateExpression, context);
        return this;
    }

    set<TContext>(expression: (record: TRecord, context: TContext) => unknown, context?: TContext): UpdateBuilder<TRecord> {
        this._updateExpressionBuilder.set(expression, context);
        return this;
    }

    async executeAsync(): Promise<boolean> {
        const client = this._clientResolver.resolve();
        const updateInput: UpdateItemInput = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            ReturnValues: "NONE",
            TableName: this._recordId.getTableName(),
            UpdateExpression: this._updateExpressionBuilder.buildUpdateExpression(),
            ConditionExpression: this._updateExpressionBuilder.buildConditionExpressions()
        };

        setExpressionAttributes(this._updateExpressionBuilder.attributeNames, this._updateExpressionBuilder.attributeValues, updateInput);
        const response = await client.updateItem(updateInput).promise();
        return response?.$response?.httpResponse?.statusCode === 200;
    }
}
