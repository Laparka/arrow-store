import {DynamoDBQueryResult, DynamoDBRecord, DynamoDBRecordIndex, DynamoDBRecordIndexBase} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {QueryInput} from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDB} from "aws-sdk";

export interface ListQueryBuilder<TRecord extends DynamoDBRecord> {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): ListQueryBuilder<TRecord>
    skipTo(recordId: DynamoDBRecordIndex): ListQueryBuilder<TRecord>;
    take(takeRecords: number): ListQueryBuilder<TRecord>;
    sortByAscending(): ListQueryBuilder<TRecord>;
    sortByDescending(): ListQueryBuilder<TRecord>;
    listAsync(): Promise<DynamoDBQueryResult<TRecord>>;
}

export class DynamoDBListQueryBuilder<TRecord extends DynamoDBRecord> implements ListQueryBuilder<TRecord> {
    private readonly _recordQuery: DynamoDBRecordIndexBase<TRecord>;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _expressionTransformer: DynamoDBExpressionTransformer;

    private readonly _filterExpressions: string[];
    private _scanIndexFwd: boolean = false;
    private _exclusiveStartKey: DynamoDB.Key | undefined;
    private _limit: number | undefined;

    constructor(recordQuery: DynamoDBRecordIndexBase<TRecord>,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        this._recordQuery = recordQuery;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._expressionTransformer = new DynamoDBExpressionTransformer("queryParam");
        this._filterExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): ListQueryBuilder<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(query);
        const expression = PredicateExpressionParser.Instance.parse(query, tokens);
        const readSchema = this._schemaProvider.getReadingSchema(this._recordQuery.getRecordTypeId());
        this._filterExpressions.push(this._expressionTransformer.transform(readSchema, expression, parametersMap));
        return this;
    }

    skipTo(recordId: DynamoDBRecordIndex): ListQueryBuilder<TRecord> {
        if (!recordId) {
            throw Error(`The recordId is missing`)
        }

        this._exclusiveStartKey = this._recordMapper.toKeyAttribute(recordId.getPrimaryKeys());
        return this;
    }

    take(takeRecords: number): ListQueryBuilder<TRecord> {
        if (takeRecords <= 0) {
            throw Error(`The takeRecords argument must be greater than zero`);
        }

        this._limit = takeRecords;
        return this;
    }

    sortByAscending(): ListQueryBuilder<TRecord> {
        this._scanIndexFwd = true;
        return this;
    }

    sortByDescending(): ListQueryBuilder<TRecord> {
        this._scanIndexFwd = false;
        return this;
    }

    async listAsync(): Promise<DynamoDBQueryResult<TRecord>> {
        if (!this._recordQuery) {
            throw Error(`The recordQuery is missing`);
        }

        const tableName: string | undefined = this._recordQuery.getTableName();
        if (!tableName) {
            throw Error(`The DynamoDB Table name was not found in the record's query`);
        }

        const queryInput: QueryInput = {
            TableName: this._recordQuery.getTableName(),
            ExpressionAttributeValues: {},
            ExclusiveStartKey: this._exclusiveStartKey,
            ConsistentRead: this._recordQuery.isConsistentRead(),
            ScanIndexForward: this._scanIndexFwd,
            Limit: this._limit
        };

        if (this._filterExpressions.length === 1) {
            queryInput.FilterExpression = this._filterExpressions[0];
        }
        else {
            queryInput.FilterExpression = this._filterExpressions.map(filter => `(${filter})`).join(' AND ');
        }

        this._expressionTransformer.expressionAttributeValues.forEach((value, key) => {
            queryInput.ExpressionAttributeValues![key] = value;
        });

        const primaryKeys = this._recordQuery.getPrimaryKeys();
        if (!primaryKeys || primaryKeys.length === 0 || primaryKeys.length > 2) {
            throw Error(`The query attributes are missing`);
        }

        const keyExpression = this._recordMapper.toKeyExpression(primaryKeys);
        queryInput.KeyConditionExpression = keyExpression.expression;
        keyExpression.attributeValues.forEach((value, key) => {
            queryInput.ExpressionAttributeValues![key] = value;
        });

        const client = this._clientResolver.resolve();
        const response = await client.query(queryInput).promise();
        const records: TRecord[] = [];
        if (response.Items && response.Count && response.Count > 0) {
            const recordTypeId = this._recordQuery.getRecordTypeId();
            response.Items.forEach(attribute => {
                records.push(this._recordMapper.toRecord<TRecord>(this._recordQuery.getRecordType(), recordTypeId, attribute));
            });
        }

        return {
            lastKey: this._recordMapper.toPrimaryKey(response.LastEvaluatedKey),
            total: response.Count || 0,
            records: records
        }
    }
}
