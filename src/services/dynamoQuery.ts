import {DynamoDBQueryResult, DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDB} from "aws-sdk";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBAttributeSchema, DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";
import {QueryInput} from "aws-sdk/clients/dynamodb";

export class DynamoQuery<TRecord extends DynamoDBRecord> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();
    private readonly _recordQuery: DynamoDBQueryIndexBase<TRecord>;
    private readonly _recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>;
    private readonly _expressionTransformer: DynamoDBExpressionTransformer;
    private readonly _filterExpressions: string[];
    private readonly _dynamoDBQuery: QueryInput;

    constructor(recordQuery: DynamoDBQueryIndexBase<TRecord>, recordSchema: ReadonlyMap<string, DynamoDBAttributeSchema>) {
        this._recordQuery = recordQuery;
        this._filterExpressions = [];
        this._recordSchema = recordSchema;
        this._expressionTransformer = new DynamoDBExpressionTransformer(recordSchema)
        this._dynamoDBQuery = {
            TableName: "",
            ExpressionAttributeValues: this._expressionTransformer.expressionAttributeValues
        };
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
        return this;
    }

    take(takeRecords: number) : DynamoQuery<TRecord> {
        return this;
    }

    sortByAscending() : DynamoQuery<TRecord>{
        return this;
    }

    sortByDescending() : DynamoQuery<TRecord> {
        return this;
    }

    listAsync(): Promise<DynamoDBQueryResult<TRecord>> {
        const result: DynamoDBQueryResult<TRecord> = {
            lastKey: null,
            records: [],
            total: 0
        };

        const ddb = new DynamoDB();
        ddb.query({
            TableName: '',
            KeyConditionExpression: '',

        }, err => {});
        return Promise.resolve(result)
    }
}
