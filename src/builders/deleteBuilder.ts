import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {Delete, DeleteItemInput} from "aws-sdk/clients/dynamodb";
import {joinFilterExpressions, setExpressionAttributes} from "./utils";
import {WhenExpressionBuilder} from "./batchWriteBuilder";

export type TransactDeleteItemBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): TransactDeleteItemBuilder<TRecord>;
};

export type DeleteBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): DeleteBuilder<TRecord>;
    executeAsync(): Promise<boolean>
};

export class DynamoDBBatchDeleteItemBuilder<TRecord extends DynamoDBRecord> extends WhenExpressionBuilder<TRecord> implements TransactDeleteItemBuilder<TRecord> {
    private readonly _conditionExpressions: string[];

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper) {
        super(recordId, schemaProvider, recordMapper);
        this._conditionExpressions = [];
    }


    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context: TContext | undefined): TransactDeleteItemBuilder<TRecord> {
        this._conditionExpressions.push(this.toWhereExpression<TContext>(predicate, context));
        return this;
    }

    build(): Delete {
        const tableName = this._recordId.getTableName();
        const deleteItem: Delete = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            TableName: tableName
        };

        deleteItem.ConditionExpression = joinFilterExpressions(this._conditionExpressions);
        setExpressionAttributes(this.attributeNames, this.attributeValues, deleteItem);
        return deleteItem;
    }

}

export class DynamoDBDeleteItemBuilder<TRecord extends DynamoDBRecord> extends WhenExpressionBuilder<TRecord> implements DeleteBuilder<TRecord>{
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _conditionExpressions: string[];

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super(recordId, schemaProvider, recordMapper);
        this._clientResolver = clientResolver;
        this._conditionExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context: TContext | undefined): DeleteBuilder<TRecord> {
        this._conditionExpressions.push(this.toWhereExpression(predicate, context));
        return this;
    }

    async executeAsync(): Promise<boolean> {
        const client = this._clientResolver.resolve();
        const deleteItemInput: DeleteItemInput = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            ReturnValues: "NONE",
            TableName: this._recordId.getTableName()
        };
        deleteItemInput.ConditionExpression = joinFilterExpressions(this._conditionExpressions);
        setExpressionAttributes(this.attributeNames, this.attributeValues, deleteItemInput);
        const response = await client.deleteItem(deleteItemInput).promise();
        return response?.$response?.httpResponse?.statusCode === 200;
    }
}