import {
    DynamoDBRecord,
    DynamoDBRecordIndex,
    DynamoDBRecordIndexBase, GetRecordInBatchRequest
} from "../records/record";
import {DynamoDBListQueryBuilder, ListQueryBuilder} from "../builders/listQueryBuilder";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBUpdateBuilder, UpdateBuilder} from "../builders/updateBuilder";
import {DeleteBuilder, DynamoDBDeleteItemBuilder} from "../builders/deleteBuilder";
import {DynamoDBPutBuilder, PutBuilder} from "../builders/putBuilder";
import {
    AttributeMap,
    BatchGetItemInput,
    BatchGetItemOutput,
    BatchGetRequestMap, BatchWriteItemInput, BatchWriteItemOutput, Get,
    GetItemInput, ItemResponse,
    Key, TransactGetItemList, TransactGetItemsInput, TransactGetItemsOutput
} from "aws-sdk/clients/dynamodb";
import {
    BatchWriteBuilder,
    DynamoDBBatchWriteBuilder
} from "../builders/batchWriteBuilder";
import {DynamoDBTransactWriteItemBuilder, TransactWriteBuilder} from "../builders/transactWriteBuilder";

export interface DatabaseService {
    getAsync<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): Promise<TRecord | null>;
    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): ListQueryBuilder<TRecord>;
    put<TRecord extends DynamoDBRecord>(record: TRecord): PutBuilder<TRecord>;
    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): UpdateBuilder<TRecord>;
    delete<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): DeleteBuilder<TRecord>;
    batchGetAsync(getRequests: GetRecordInBatchRequest[]): Promise<DynamoDBRecord[]>;
    batchWriteAsync(param: (query: BatchWriteBuilder) => void): Promise<void>;
    transactGetItemsAsync(recordIds: DynamoDBRecordIndex[]): Promise<DynamoDBRecord[]>;
    transactWriteItems(clientRequestToken?: string): TransactWriteBuilder;
}

export class DynamoDBService implements DatabaseService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    async getAsync<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): Promise<TRecord | null> {
        if (!recordId) {
            throw Error(`The recordId is missing`);
        }

        const tableName: string | undefined = recordId.getTableName();
        if (!tableName) {
            throw Error(`The DynamoDB Table name was not found in the record's ID`);
        }

        const primaryKeys = recordId.getPrimaryKeys();
        const getInput: GetItemInput = {
            TableName: tableName,
            ConsistentRead: recordId.isConsistentRead(),
            Key: this._recordMapper.toKeyAttribute(primaryKeys)
        };

        const client = this._clientResolver.resolve();
        const response = await client.getItem(getInput).promise();
        if (!response.Item || Object.getOwnPropertyNames(response.Item).length === 0) {
            return null;
        }

        return this._recordMapper.toRecord<TRecord>(recordId.getRecordType(), recordId.getRecordTypeId(), response.Item);
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): ListQueryBuilder<TRecord> {
        return new DynamoDBListQueryBuilder<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    delete<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): DeleteBuilder<TRecord> {
        return new DynamoDBDeleteItemBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    put<TRecord extends DynamoDBRecord>(record: TRecord): PutBuilder<TRecord> {
        return new DynamoDBPutBuilder<TRecord>(record, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndexBase<TRecord>): UpdateBuilder<TRecord> {
        return new DynamoDBUpdateBuilder(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    async batchGetAsync(getRequests: GetRecordInBatchRequest[]): Promise<DynamoDBRecord[]> {
        if (!getRequests || getRequests.length === 0) {
            throw Error(`The recordIndices argument is required`);
        }

        const batchGetRequest: BatchGetRequestMap = {};
        const keyReferences = new Map<string, GetRecordInBatchRequest>();
        const tablePrimaryAttrNames = new Map<string, string[]>();
        for(let i = 0; i < getRequests.length; i++) {
            const getRequest = getRequests[i];
            const tableName = getRequest.recordId.getTableName();
            const primaryKeys = getRequest.recordId.getPrimaryKeys();
            let keyList = batchGetRequest[tableName];
            if (!keyList) {
                keyList = {
                    Keys: []
                };
                batchGetRequest[tableName] = keyList;
                tablePrimaryAttrNames.set(tableName, primaryKeys.map(id => id.getAttributeName()));
            }

            const key = this._recordMapper.toKeyAttribute(primaryKeys);
            keyList.Keys.push(key);
            keyReferences.set(DynamoDBService._toRecordIdHash(tableName, key), getRequest)
        }

        const client = this._clientResolver.resolve();
        const input: BatchGetItemInput = {
            RequestItems: batchGetRequest
        };

        const records: DynamoDBRecord[] = [];
        let response: BatchGetItemOutput;
        let totalProcessed = 0;
        do {
            response = await client.batchGetItem(input).promise();
            if (!response) {
                break;
            }

            if (response.Responses) {
                const tableNames = Object.getOwnPropertyNames(response.Responses);
                for (let i = 0; i < tableNames.length; i++) {
                    const tableName = tableNames[i];
                    const primaryAttrNames = tablePrimaryAttrNames.get(tableName);
                    if (!primaryAttrNames) {
                        throw Error(`Could not find the primary attributes for the ${tableName}-table`);
                    }

                    const items = response.Responses[tableName];
                    for(let j = 0; j < items.length; j++) {
                        const itemAttributes = items[j];
                        const getRequest = DynamoDBService._findRequest(tableName, primaryAttrNames, itemAttributes, keyReferences);
                        const record = new DummyRecord(getRequest.recordId);
                        this._recordMapper.fillRecord(record, getRequest.recordId.getRecordTypeId(), itemAttributes)
                        getRequest.record = record;
                        records.push(record);
                        totalProcessed++;
                    }
                }
            }

            if (response.UnprocessedKeys) {
                input.RequestItems = response.UnprocessedKeys;
            }
        }
        while(response.UnprocessedKeys && Object.getOwnPropertyNames(response.UnprocessedKeys).length !== 0)
        return records;
    }

    async batchWriteAsync(builder: (query: BatchWriteBuilder) => void): Promise<void> {
        const writeBuilder = new DynamoDBBatchWriteBuilder(this._recordMapper);
        builder(writeBuilder);
        const requests = writeBuilder.buildRequests();
        const client = this._clientResolver.resolve();
        const input: BatchWriteItemInput = {
            RequestItems: requests,
            ReturnItemCollectionMetrics: "NONE",
            ReturnConsumedCapacity: "NONE"
        };

        let response: BatchWriteItemOutput;
        do {
            response = await client.batchWriteItem(input).promise();
            if (response.UnprocessedItems) {
                input.RequestItems = response.UnprocessedItems;
            }
        }
        while(response.UnprocessedItems && Object.getOwnPropertyNames(response.UnprocessedItems).length !== 0)
    }

    async transactGetItemsAsync(recordIds: DynamoDBRecordIndex[]): Promise<DynamoDBRecord[]> {
        if (!recordIds || recordIds.length === 0) {
            throw Error(`The recordIds argument is required`);
        }

        const transactGetRequest: TransactGetItemList = [];
        for(let i = 0; i < recordIds.length; i++) {
            const recordId = recordIds[i];
            const tableName = recordId.getTableName();
            const primaryKeys = recordId.getPrimaryKeys();
            const key = this._recordMapper.toKeyAttribute(primaryKeys);
            transactGetRequest.push({
                Get: {
                    Key: key,
                    TableName: tableName
                }
            });
        }

        const client = this._clientResolver.resolve();
        const input: TransactGetItemsInput = {
            TransactItems: transactGetRequest
        };

        const records: DynamoDBRecord[] = [];
        let response: TransactGetItemsOutput;
        response = await client.transactGetItems(input).promise();
        if (response.Responses) {
            for(let i = 0; i < response.Responses.length; i++) {
                const transactResponse = response.Responses[i];
                if (!transactResponse?.Item) {
                    continue;
                }

                const recordId = recordIds[i];
                const record = new DummyRecord(recordId);
                this._recordMapper.fillRecord(record, recordId.getRecordTypeId(), transactResponse.Item)
                records.push(record);
            }
        }

        return records;
    }

    transactWriteItems(clientRequestToken?: string): TransactWriteBuilder {
        return new DynamoDBTransactWriteItemBuilder(this._schemaProvider, this._recordMapper, this._clientResolver, clientRequestToken);
    }

    private static _toRecordIdHash(tableName: string, key: Key): string {
        const attributeNames = Object.getOwnPropertyNames(key).sort();
        const segments: string[] = [tableName];
        for(let i = 0; i < attributeNames.length; i++) {
            const attributeName = attributeNames[i];
            segments.push(`${attributeName}:${JSON.stringify(key[attributeName])}`);
        }

        return segments.join('#');
    }

    private static _findRequest(tableName: string,
                          primaryAttrNames: string[],
                          itemAttributes: AttributeMap,
                          keyReferences: Map<string, GetRecordInBatchRequest>): GetRecordInBatchRequest {
        const segments: string[] = [tableName];
        primaryAttrNames = primaryAttrNames.sort();
        for(let i = 0; i < primaryAttrNames.length; i++) {
            const attributeName = primaryAttrNames[i];
            const attributeValue = itemAttributes[attributeName];
            segments.push(`${attributeName}:${JSON.stringify(attributeValue)}`);
        }

        const request = keyReferences.get(segments.join('#'));
        if (!request) {
            throw Error(`Could not find the GetRecordInBatch-request for the given hash ${segments.join('#')}`);
        }

        return request;
    }
}

class DummyRecord implements DynamoDBRecord {
    private readonly _recordId: DynamoDBRecordIndex;
    constructor(recordId: DynamoDBRecordIndex) {
        this._recordId = recordId;
    }

    getRecordId(): DynamoDBRecordIndex {
        return this._recordId;
    }
}
