import {DynamoDBRecord, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {PutItemInput} from "aws-sdk/clients/dynamodb";

export class DynamoService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): DynamoQuery<TRecord> {
        return new DynamoQuery<TRecord>(query, this._schemaProvider, this._recordMapper, this._clientResolver);
    }

    async saveAsync<TRecord extends DynamoDBRecord>(record: TRecord): Promise<boolean> {
        if (!record || !record.getRecordId) {
            throw Error(`The getRecordId function implementation is missing at the record object`);
        }

        const recordId = record.getRecordId();
        if (!record) {
            throw Error(`The record's getRecordId-function did not return the record's ID`);
        }

        const typeId = recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing, which is required for schema discovery and mapping`);
        }

        const attributesToSave = this._recordMapper.toAttributeMap<TRecord>(typeId, record)
        if (!attributesToSave) {
            throw Error(`Failed to map the record ${Symbol.keyFor(typeId)} to DynamoDB attributes`);
        }

        const client = this._clientResolver.resolve();
        const putRequest: PutItemInput = {
            TableName: recordId.getTableName(),
            Item: attributesToSave,
            ReturnValues: "NONE",
            ReturnConsumedCapacity: "TOTAL",
            ReturnItemCollectionMetrics: "NONE"
        };

        const putResp = await client.putItem(putRequest).promise()
        return putResp.$response?.httpResponse?.statusCode === 200;
    }
}
