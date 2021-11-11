import {DynamoDBRecord, DynamoDBRecordIndexBase, PRIMARY_ATTRIBUTE_TYPE} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {PutItemInput, UpdateItemInput} from "aws-sdk/clients/dynamodb";

export class DynamoService {
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;

    constructor(clientResolver: DynamoDBClientResolver, schemaProvider: DynamoDBSchemaProvider, recordMapper: DynamoDBRecordMapper) {
        this._clientResolver = clientResolver;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
    }

    query<TRecord extends DynamoDBRecord>(query: DynamoDBRecordIndexBase<TRecord>): DynamoQuery<TRecord>{
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

        const partitionKeys = recordId.getPrimaryKeys();
        if (!partitionKeys || partitionKeys.length !== 2) {
            throw Error(`The partition and range keys are required in order to save the record to DynamoDB`)
        }

        const requiredTypes = ["Partition", "Range"];
        let checkSum = 3;
        for(let i = 0; i < partitionKeys.length; i++) {
            const foundIndex = requiredTypes.findIndex(x => x === partitionKeys[i].attributeType);
            if (foundIndex >= 0) {
                checkSum -= (foundIndex + 1);
            }
        }

        if (checkSum !== 0) {
            throw Error(`Both the Partition and Range keys are required at the recordId`);
        }

        const attributesToSave = this._recordMapper.mapRecord<TRecord>(typeId, record)
        if (!attributesToSave) {
            throw Error(`Failed to map the record ${Symbol.keyFor(typeId)} to DynamoDB attributes`);
        }

        const client = this._clientResolver.resolve();
        const putRequest: PutItemInput = {
            TableName: recordId.getTableName(),
            Item: attributesToSave,
            ReturnValues: "NONE",
            ReturnConsumedCapacity: "NONE",
            ReturnItemCollectionMetrics: "NONE"
        };

        const putResp = await client.putItem(putRequest).promise()
        return putResp.$response?.httpResponse?.statusCode === 200;
    }
}
