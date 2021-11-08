import {DynamoDBQueryResult, DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDB} from "aws-sdk";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";

export class DynamoQuery<TRecord extends DynamoDBRecord> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();
    private static readonly _Transformer = new DynamoDBExpressionTransformer();

    private readonly _recordQuery: DynamoDBQueryIndexBase<TRecord>;
    private readonly _wherePredicates: ((value: TRecord) => boolean)[];

    constructor(recordQuery: DynamoDBQueryIndexBase<TRecord>) {
        this._recordQuery = recordQuery;
        this._wherePredicates = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext) : DynamoQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = DynamoQuery._Lexer.tokenize(query);
        const expression = DynamoQuery._Parser.parse(query, tokens);
        const filterExpression = DynamoQuery._Transformer.transform(expression, undefined, parametersMap)
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
            KeyConditionExpression: ''
        }, err => {});
        ddb.makeRequest('QUERY')
        return Promise.resolve(result)
    }
}
