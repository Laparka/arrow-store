import {ArrowStoreRecord} from "../types";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {WhenExpressionBuilder} from "./batchWriteBuilder";
import {Put, PutItemInput} from "aws-sdk/clients/dynamodb";
import {joinFilterExpressions, setExpressionAttributes} from "./utils";
import {DynamoDBClientResolver} from "../client";

export type PutBuilder<TRecord extends ArrowStoreRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): PutBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};

export type TransactPutItemBuilder<TRecord extends ArrowStoreRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): TransactPutItemBuilder<TRecord>;
};

export class DynamoDBTransactPutItemBuilder<TRecord extends ArrowStoreRecord> extends WhenExpressionBuilder<TRecord> implements TransactPutItemBuilder<TRecord> {
    private readonly _record: TRecord;
    private readonly _conditionExpressions: string[];

    constructor(record: TRecord,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper) {
        super(record.getRecordId(), schemaProvider, recordMapper);
        this._record = record;
        this._conditionExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context: TContext | undefined): TransactPutItemBuilder<TRecord> {
        this._conditionExpressions.push(this.toWhereExpression(predicate, context));
        return this;
    }

    build(): Put {
        if (!this._record || !this._record.getRecordId) {
            throw Error(`The getRecordId function implementation is missing at the record object`);
        }

        const recordId = this._record.getRecordId();
        if (!recordId) {
            throw Error(`The record's getRecordId-function did not return the record's ID`);
        }

        const typeId = recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing, which is required for schema discovery and mapping`);
        }

        const attributesToSave = this._recordMapper.toAttributeMap<TRecord>(typeId, this._record);
        if (!attributesToSave) {
            throw Error(`Failed to map the record ${typeId} to DynamoDB attributes`);
        }

        const put: Put = {
            Item: attributesToSave,
            TableName: recordId.getTableName(),
            ReturnValuesOnConditionCheckFailure: "NONE",
            ConditionExpression: joinFilterExpressions(this._conditionExpressions)
        };

        setExpressionAttributes(this.attributeNames, this.attributeValues, put);
        return put;
    }
}

export class DynamoDBPutBuilder<TRecord extends ArrowStoreRecord> extends WhenExpressionBuilder<TRecord> implements PutBuilder<TRecord> {
    private readonly _record: TRecord;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _conditionExpressions: string[];

    constructor(record: TRecord,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super(record.getRecordId(), schemaProvider, recordMapper);
        this._record = record;
        this._clientResolver = clientResolver;
        this._conditionExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): PutBuilder<TRecord> {
        this._conditionExpressions.push(this.toWhereExpression(predicate, context));
        return this;
    }

    async executeAsync(): Promise<boolean> {
        if (!this._record || !this._record.getRecordId) {
            throw Error(`The getRecordId function implementation is missing at the record object`);
        }

        const recordId = this._record.getRecordId();
        if (!recordId) {
            throw Error(`The record's getRecordId-function did not return the record's ID`);
        }

        const typeId = recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing, which is required for schema discovery and mapping`);
        }

        const attributesToSave = this._recordMapper.toAttributeMap<TRecord>(typeId, this._record);
        if (!attributesToSave) {
            throw Error(`Failed to map the record ${typeId} to DynamoDB attributes`);
        }

        const client = this._clientResolver.resolve();
        const putRequest: PutItemInput = {
            TableName: recordId.getTableName(),
            Item: attributesToSave,
            ReturnValues: "NONE",
            ReturnConsumedCapacity: "TOTAL",
            ReturnItemCollectionMetrics: "NONE"
        };

        putRequest.ConditionExpression = joinFilterExpressions(this._conditionExpressions);
        setExpressionAttributes(this.attributeNames, this.attributeValues, putRequest);
        const putResp = await client.putItem(putRequest).promise()
        return putResp.$response?.httpResponse?.statusCode === 200;
    }
}
