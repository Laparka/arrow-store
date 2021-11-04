import {QueryResult, Record, RecordQueryBase} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";

export class DynamoQuery<TRecord extends Record> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();

    private readonly _recordQuery: RecordQueryBase<TRecord>;
    private readonly _wherePredicates: ((value: TRecord) => boolean)[];

    constructor(recordQuery: RecordQueryBase<TRecord>) {
        this._recordQuery = recordQuery;
        this._wherePredicates = [];
    }

    where(predicate: (value: TRecord) => boolean) : DynamoQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        this._wherePredicates.push(predicate);
        return this;
    }

    skipTo(recordId: RecordQueryBase<TRecord>) : DynamoQuery<TRecord> {
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

    listAsync(parametersMap?: any): Promise<QueryResult<TRecord>> {
        const result: QueryResult<TRecord> = {
            lastKey: null,
            records: [],
            total: 0
        };

        return Promise.resolve(result)
    }
}
