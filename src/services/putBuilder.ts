import {DynamoDBRecord} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBFilterExpressionTransformer} from "../parser/filterExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import FilterExpressionParser from "../parser/filterExpressionParser";
import {PutItemInput} from "aws-sdk/clients/dynamodb";

export type PutBuilder<TRecord extends DynamoDBRecord> = {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): PutBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};

export class DynamoDBPutBuilder<TRecord extends DynamoDBRecord> implements PutBuilder<TRecord> {
    private readonly _record: TRecord;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _expressionTransformer: DynamoDBFilterExpressionTransformer;
    private readonly _conditionExpressions: string[];

    constructor(record: TRecord,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        this._record = record;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._expressionTransformer = new DynamoDBFilterExpressionTransformer("filterParam");
        this._conditionExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): PutBuilder<TRecord> {
        if (!predicate) {
            throw Error(`The where-predicate is missing`);
        }

        if (!this._record?.getRecordId || !this._record.getRecordId().getRecordTypeId) {
            throw Error(`The record's ID object does not contains the required record type ID attribute`);
        }

        const readingSchema = this._schemaProvider.getReadingSchema(this._record.getRecordId().getRecordTypeId());
        const whereString = predicate.toString()
        const tokens = LambdaPredicateLexer.Instance.tokenize(whereString);
        const expression = FilterExpressionParser.Instance.parse(whereString, tokens);
        this._conditionExpressions.push(this._expressionTransformer.transform(readingSchema, expression));
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

        if (this._conditionExpressions.length === 1) {
            putRequest.ConditionExpression = this._conditionExpressions[0];
        }
        else if (this._conditionExpressions.length > 1) {
            putRequest.ConditionExpression = this._conditionExpressions.map(condition => `(${condition})`).join(' AND ');
        }

        this._expressionTransformer.expressionAttributeValues.forEach((value, key) => {
            if (!putRequest.ExpressionAttributeValues) {
                putRequest.ExpressionAttributeValues = {};
            }

            putRequest.ExpressionAttributeValues[key] = value;
        });

        const putResp = await client.putItem(putRequest).promise()
        return putResp.$response?.httpResponse?.statusCode === 200;
    }
}
