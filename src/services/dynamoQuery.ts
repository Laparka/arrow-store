import {DynamoDBQueryResult, DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBAttributeSchema} from "../mappers/schemaBuilders";
import { DynamoDB } from 'aws-sdk'
import { QueryInput } from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "./dynamoResolver";


export class DynamoQuery<TRecord extends DynamoDBRecord> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();

    private readonly _recordQuery: DynamoDBQueryIndexBase<TRecord>;
    private readonly _recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _expressionTransformer: DynamoDBExpressionTransformer;
    private readonly _filterExpressions: string[];
    private _ddbQueryInput: QueryInput | undefined;

    constructor(recordQuery: DynamoDBQueryIndexBase<TRecord>, recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>, clientResolver: DynamoDBClientResolver) {
        this._recordQuery = recordQuery;
        this._recordSchema = recordSchema;
        this._clientResolver = clientResolver;
        this._filterExpressions = [];
        this._expressionTransformer = new DynamoDBExpressionTransformer(recordSchema)
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext) : DynamoQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = DynamoQuery._Lexer.tokenize(query);
        const expression = DynamoQuery._Parser.parse(query, tokens);
        this._filterExpressions.push(this._expressionTransformer.transform(expression, parametersMap));
        return this;
    }

    skipTo(recordId: DynamoDBQueryIndexBase<TRecord>) : DynamoQuery<TRecord> {
        const queryInput = this._getQueryInput();
        queryInput.ExclusiveStartKey = {};
        recordId.getPrimaryKeys().forEach(primaryKey => {
            queryInput.ExclusiveStartKey![primaryKey.attributeName] = {
                S: primaryKey.attributeValue
            }
        })

        return this;
    }

    take(takeRecords: number) : DynamoQuery<TRecord> {
        if (takeRecords <= 0) {
            throw Error(`The takeRecords argument must be greater than zero`);
        }

        const queryInput = this._getQueryInput();
        queryInput.Limit = takeRecords;
        return this;
    }

    sortByAscending() : DynamoQuery<TRecord>{
        const queryInput = this._getQueryInput();
        queryInput.ScanIndexForward = true;
        return this;
    }

    sortByDescending() : DynamoQuery<TRecord> {
        const queryInput = this._getQueryInput();
        queryInput.ScanIndexForward = false;
        return this;
    }

    async listAsync(): Promise<DynamoDBQueryResult<TRecord>> {
        const queryInput = this._getQueryInput();
        this._filterExpressions.forEach(filterExp => {
            if (queryInput.FilterExpression) {
                queryInput.FilterExpression = `(${queryInput.FilterExpression}) && (${filterExp})`;
            }
            else {
                queryInput.FilterExpression = filterExp;
            }
        });

        this._expressionTransformer.expressionAttributeValues.forEach((value, key) => {
            queryInput.ExpressionAttributeValues![key] = value;
        });

        const keyExpression: string[] = [];
        this._recordQuery.getPrimaryKeys()
            .forEach((value, index) => {
                const key = `:primary${index}`;
                queryInput.ExpressionAttributeValues![key] = {
                    S: value.attributeValue
                }
                keyExpression.push(`${value.attributeName} = ${key}`)
            });
        queryInput.KeyConditionExpression = keyExpression.join(' AND ');
        const client = this._clientResolver.resolve();
        const response = await client.query(queryInput).promise();
        return {
            lastKey: null,
            records: [],
            total: 0
        };
    }

    private _getQueryInput(): QueryInput {
        if (!this._ddbQueryInput) {
            this._ddbQueryInput = {
                TableName: this._recordQuery.tableName(),
                ExpressionAttributeValues: {}
            };
        }

        return this._ddbQueryInput;
    }
}
