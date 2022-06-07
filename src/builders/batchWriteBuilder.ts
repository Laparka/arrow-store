import {AttributeValue, BatchWriteItemRequestMap, WriteRequests} from "aws-sdk/clients/dynamodb";
import {ExpressionAttribute, ExpressionTransformer} from "../transformers/expressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import {WhereCauseExpressionTransformer} from "../transformers/whereCauseExpressionTransformer";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";

export type BatchWriteBuilder = {
    put<TRecord extends DynamoDBRecord>(record: TRecord): BatchWriteBuilder;
    delete(recordId: DynamoDBRecordIndex): BatchWriteBuilder;
};

export class WhenExpressionBuilder<TRecord extends DynamoDBRecord> {
    protected readonly _recordId: DynamoDBRecordIndex;
    protected readonly _schemaProvider: DynamoDBSchemaProvider;
    protected readonly _recordMapper: DynamoDBRecordMapper;
    protected readonly _conditionFilterTransformer: ExpressionTransformer;

    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeValues: Map<string, AttributeValue>;

    private readonly _attributeNameAliases: Map<string, ExpressionAttribute>;
    private readonly _attributeValueAliases: Map<string, string>;

    constructor(recordId: DynamoDBRecordIndex,
                          schemaProvider: DynamoDBSchemaProvider,
                          recordMapper: DynamoDBRecordMapper) {
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;

        this._attributeNames = new Map<string, string>();
        this._attributeValues = new Map<string, AttributeValue>();

        this._attributeNameAliases = new Map<string, ExpressionAttribute>();
        this._attributeValueAliases = new Map<string, string>();
        this._conditionFilterTransformer = new WhereCauseExpressionTransformer("attr_name",
            this._attributeNames,
            this._attributeNameAliases,
            this._attributeValues,
            this._attributeValueAliases);


    }

    get attributeNames(): Map<string, string> {
        return this._attributeNames;
    }

    get attributeNameAliases(): Map<string, ExpressionAttribute> {
        return this._attributeNameAliases;
    }

    get attributeValueAliases(): Map<string, string> {
        return this._attributeValueAliases;
    }

    get attributeValues(): Map<string, AttributeValue> {
        return this._attributeValues;
    }

    toWhereExpression<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context: TContext | undefined): string {
        if (!predicate) {
            throw Error(`The condition expression is missing`);
        }

        const whereQuery = predicate.toString();
        if (!whereQuery) {
            throw Error(`The expression string is missing`);
        }

        if (!this._recordId || !this._recordId.getRecordTypeId) {
            throw Error(`The record ID or the getRecordTypeId function is not available`);
        }

        const typeId = this._recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing`);
        }

        const tokens = LambdaPredicateLexer.Instance.tokenize(whereQuery);
        const expression = WhereCauseExpressionParser.Instance.parse(whereQuery, tokens);
        const readingSchema = this._schemaProvider.getReadingSchema(typeId);
        return this._conditionFilterTransformer.transform(readingSchema, expression, context);
    }
}

export class DynamoDBBatchWriteBuilder implements BatchWriteBuilder {
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _requests: BatchWriteItemRequestMap;
    constructor(recordMapper: DynamoDBRecordMapper) {
        this._recordMapper = recordMapper;
        this._requests = {};
    }

    buildRequests(): BatchWriteItemRequestMap {
        if (Object.getOwnPropertyNames(this._requests).length === 0) {
            throw Error(`No write requests for the batch write operation`)
        }

        return this._requests;
    }

    delete(recordId: DynamoDBRecordIndex): BatchWriteBuilder {
        const keySchema = this._recordMapper.toKeyAttribute(recordId.getPrimaryKeys());
        const tableRequests = this._getTableGroup(recordId.getTableName());
        tableRequests.push({
            DeleteRequest: {
                Key: keySchema
            }
        });

        return this;
    }

    put<TRecord extends DynamoDBRecord>(record: TRecord): BatchWriteBuilder {
        const recordId = record.getRecordId()
        const attributesToSave = this._recordMapper.toAttributeMap<TRecord>(recordId.getRecordTypeId(), record);
        if (!attributesToSave) {
            throw Error(`Failed to map the record ${Symbol.keyFor(recordId.getRecordTypeId())} to DynamoDB attributes`);
        }

        const tableRequests = this._getTableGroup(recordId.getTableName());
        tableRequests.push({
            PutRequest: {
                Item: attributesToSave
            }
        })

        return this;
    }

    private _getTableGroup(tableName: string): WriteRequests {
        let tableRequests = this._requests[tableName];
        if (!tableRequests) {
            tableRequests = [];
            this._requests[tableName] = tableRequests;
        }

        return tableRequests;

    }
};