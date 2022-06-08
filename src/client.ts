import {ArrowStoreRecord, ArrowStoreRecordId, ArrowStoreTypeRecordId} from "./types";
import {DynamoDBRecordMapper} from "./mappers/recordMapper";
import {DynamoDBSchemaProvider} from "./mappers/schemaBuilders";
import {
    AttributeMap,
    BatchGetItemInput,
    BatchGetItemOutput,
    BatchGetRequestMap, BatchWriteItemInput, BatchWriteItemOutput,
    GetItemInput,
    Key, TransactGetItemList, TransactGetItemsInput, TransactGetItemsOutput
} from "aws-sdk/clients/dynamodb";
import {DynamoDBListQueryBuilder, ListQueryBuilder} from "./builders/listQueryBuilder";
import {DeleteBuilder, DynamoDBDeleteItemBuilder} from "./builders/deleteBuilder";
import {DynamoDBPutBuilder, PutBuilder} from "./builders/putBuilder";
import {DynamoDBUpdateBuilder, UpdateBuilder} from "./builders/updateBuilder";
import {BatchWriteBuilder, DynamoDBBatchWriteBuilder} from "./builders/batchWriteBuilder";
import {DynamoDBTransactWriteItemBuilder, TransactWriteBuilder} from "./builders/transactWriteBuilder";
import {DynamoDB} from "aws-sdk";

export type DynamoDBClientResolver = {
    resolve(): DynamoDB;
}

export type DynamoDBClient = {
    getAsync<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): Promise<TRecord | null>
    batchGetAsync(recordIds: ArrowStoreRecordId[]): Promise<{}[]>
    transactGetItemsAsync(recordIds: ArrowStoreRecordId[]): Promise<{}[]>
    query<TRecord>(query: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): ListQueryBuilder<TRecord>;

    delete<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): DeleteBuilder<TRecord>;
    put<TRecord extends ArrowStoreRecord>(record: TRecord): PutBuilder<TRecord>;
    update<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): UpdateBuilder<TRecord>;

    batchWriteAsync(builder: (query: BatchWriteBuilder) => void): Promise<void>;
    transactWriteItems(clientRequestToken?: string): TransactWriteBuilder
};

export class DefaultDynamoDBClient implements DynamoDBClient {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    async getAsync<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): Promise<TRecord | null> {
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

        return this._recordMapper.toRecord<TRecord>(recordId.getRecordTypeId(), response.Item);
    }

    async batchGetAsync(recordIds: ArrowStoreRecordId[]): Promise<{}[]> {
        if (!recordIds || recordIds.length === 0) {
            throw Error(`The recordIds argument is required`);
        }

        const batchGetRequest: BatchGetRequestMap = {};
        const tablePrimaryAttrNames = new Map<string, string[]>();
        const recordTypes = new Map<string, string>();
        for(let i = 0; i < recordIds.length; i++) {
            const recordId = recordIds[i];
            const tableName = recordId.getTableName();
            const primaryKeys = recordId.getPrimaryKeys();
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
            recordTypes.set(DefaultDynamoDBClient._toRecordIdHash(tableName, key), recordId.getRecordTypeId());
        }

        const client = this._clientResolver.resolve();
        const input: BatchGetItemInput = {
            RequestItems: batchGetRequest
        };

        const records: {}[] = [];
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
                        const recordTypeId = DefaultDynamoDBClient._findRecordType(tableName, primaryAttrNames, itemAttributes, recordTypes);
                        const record = {};
                        this._recordMapper.fillRecord(record, recordTypeId, itemAttributes)
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

    async transactGetItemsAsync(recordIds: ArrowStoreRecordId[]): Promise<{}[]> {
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

        const records: {}[] = [];
        let response: TransactGetItemsOutput;
        response = await client.transactGetItems(input).promise();
        if (response.Responses) {
            for(let i = 0; i < response.Responses.length; i++) {
                const transactResponse = response.Responses[i];
                if (!transactResponse?.Item) {
                    continue;
                }

                const recordId = recordIds[i];
                const record = {};
                this._recordMapper.fillRecord(record, recordId.getRecordTypeId(), transactResponse.Item)
                records.push(record);
            }
        }

        return records;
    }

    query<TRecord>(query: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): ListQueryBuilder<TRecord> {
        return new DynamoDBListQueryBuilder<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    delete<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): DeleteBuilder<TRecord> {
        return new DynamoDBDeleteItemBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    put<TRecord extends ArrowStoreRecord>(record: TRecord): PutBuilder<TRecord> {
        return new DynamoDBPutBuilder<TRecord>(record, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    update<TRecord>(recordId: ArrowStoreRecordId | ArrowStoreTypeRecordId<TRecord>): UpdateBuilder<TRecord> {
        return new DynamoDBUpdateBuilder(recordId, this._schemaProvider, this._recordMapper, this._clientResolver);
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

    private static _findRecordType(tableName: string,
                                primaryAttrNames: string[],
                                itemAttributes: AttributeMap,
                                recordTypes: Map<string, string>): string {
        const segments: string[] = [tableName];
        primaryAttrNames = primaryAttrNames.sort();
        for(let i = 0; i < primaryAttrNames.length; i++) {
            const attributeName = primaryAttrNames[i];
            const attributeValue = itemAttributes[attributeName];
            segments.push(`${attributeName}:${JSON.stringify(attributeValue)}`);
        }

        const recordTypeId = recordTypes.get(segments.join('#'));
        if (!recordTypeId) {
            throw Error(`Could not find the recordTypeId for the given hash ${segments.join('#')}`);
        }

        return recordTypeId;
    }
}