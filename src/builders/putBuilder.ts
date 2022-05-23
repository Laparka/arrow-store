import {DynamoDBRecord} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {WhereCauseExpressionTransformer} from "../transformers/whereCauseExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import {AttributeValue, PutItemInput} from "aws-sdk/clients/dynamodb";
import {ExpressionAttribute} from "../transformers/expressionTransformer";
import {AttributesBuilderBase} from "./attributesBuilderBase";

export type PutBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): PutBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};

export class DynamoDBPutBuilder<TRecord extends DynamoDBRecord> extends AttributesBuilderBase implements PutBuilder<TRecord> {
    private readonly _record: TRecord;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _expressionTransformer: WhereCauseExpressionTransformer;
    private readonly _conditionExpressions: string[];

    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeValues: Map<string, AttributeValue>;

    constructor(record: TRecord,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super();
        this._record = record;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._attributeNames = new Map<string, string>();
        this._attributeValues = new Map<string, AttributeValue>();
        const attributeNameAliases = new Map<string, ExpressionAttribute>();
        const attributeValueAliases = new Map<string, string>();
        this._expressionTransformer = new WhereCauseExpressionTransformer("attr_name",
            this._attributeNames,
            attributeNameAliases,
            this._attributeValues,
            attributeValueAliases);
        this._conditionExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): PutBuilder<TRecord> {
        if (!predicate) {
            throw Error(`The where-predicate is missing`);
        }

        if (!this._record?.getRecordId || !this._record.getRecordId().getRecordTypeId) {
            throw Error(`The record's ID object does not contains the required record type ID attribute`);
        }

        const readingSchema = this._schemaProvider.getReadingSchema(this._record.getRecordId().getRecordTypeId());
        const whereString = predicate.toString()
        const tokens = LambdaPredicateLexer.Instance.tokenize(whereString);
        const expression = WhereCauseExpressionParser.Instance.parse(whereString, tokens);
        this._conditionExpressions.push(this._expressionTransformer.transform(readingSchema, expression, parametersMap));
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

        putRequest.ConditionExpression = this.joinFilterExpressions(this._conditionExpressions);
        this.setExpressionAttributes(this._attributeNames, this._attributeValues, putRequest);
        const putResp = await client.putItem(putRequest).promise()
        return putResp.$response?.httpResponse?.statusCode === 200;
    }
}
