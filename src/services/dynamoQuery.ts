import {
    DynamoDBQueryResult,
    DynamoDBRecord, DynamoDBRecordIndex,
    DynamoDBRecordIndexBase
} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {QueryInput} from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDB} from "aws-sdk";


export class DynamoQuery<TRecord extends DynamoDBRecord> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();

    private readonly _recordQuery: DynamoDBRecordIndexBase<TRecord>;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;


    private readonly _filterExpressions: string[];
    private _expressionTransformer: DynamoDBExpressionTransformer | undefined;
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
        this._filterExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext) : DynamoQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = DynamoQuery._Lexer.tokenize(query);
        const expression = DynamoQuery._Parser.parse(query, tokens);
        const transformer = this._getExpressionTransformer();
        this._filterExpressions.push(transformer.transform(expression, parametersMap));
        return this;
    }

    skipTo(recordId: DynamoDBRecordIndex) : DynamoQuery<TRecord> {
        if (!recordId) {
            throw Error(`The recordId is missing`)
        }

        this._exclusiveStartKey = this._recordMapper.toKeyAttribute(recordId.getPrimaryKeys());
        return this;
    }

    take(takeRecords: number) : DynamoQuery<TRecord> {
        if (takeRecords <= 0) {
            throw Error(`The takeRecords argument must be greater than zero`);
        }

        this._limit = takeRecords;
        return this;
    }

    sortByAscending() : DynamoQuery<TRecord>{
        this._scanIndexFwd = true;
        return this;
    }

    sortByDescending() : DynamoQuery<TRecord> {
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

        this._filterExpressions.forEach(filterExp => {
            if (queryInput.FilterExpression) {
                queryInput.FilterExpression = `(${queryInput.FilterExpression}) AND (${filterExp})`;
            }
            else {
                queryInput.FilterExpression = filterExp;
            }
        });

        this._getExpressionTransformer().expressionAttributeValues.forEach((value, key) => {
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
                records.push(this._recordMapper.toRecord<TRecord>(recordTypeId, attribute));
            });
        }

        return {
            lastKey: this._recordMapper.toPrimaryKey(response.LastEvaluatedKey),
            total: response.Count || 0,
            records: records
        }
    }

    private _getExpressionTransformer(): DynamoDBExpressionTransformer {
        if (!this._expressionTransformer) {
            const readingSchema = this._schemaProvider.getReadingSchema(this._recordQuery.getRecordTypeId());
            this._expressionTransformer = new DynamoDBExpressionTransformer(readingSchema)
        }

        return this._expressionTransformer;
    }
}
