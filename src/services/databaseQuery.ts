import {QueryResult, Record, RecordQueryBase} from "../records/record";
import {LambdaExpressionLexer} from "../lexer/lambdaExpressionLexer";
import DynamoDBExpressionParser from "../parser/dynamoExpressionParser";

const lexer = new LambdaExpressionLexer();
const parser = new DynamoDBExpressionParser();
export class DatabaseQuery<TRecord extends Record> {
    private readonly _recordQuery: RecordQueryBase<TRecord>;

    constructor(recordQuery: RecordQueryBase<TRecord>) {
        this._recordQuery = recordQuery;
    }

    where(predicate: (value: TRecord) => boolean) : DatabaseQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = lexer.tokenize(query);
        if (tokens.length === 0) {
            throw Error(`Failed to parse the where-expression: ${query}`);
        }

        const node = parser.parse(query, tokens);
        return this;
    }

    skipTo(recordId: RecordQueryBase<TRecord>) : DatabaseQuery<TRecord> {
        return this;
    }

    take(takeRecords: number) : DatabaseQuery<TRecord> {
        return this;
    }

    sortByAscending() : DatabaseQuery<TRecord>{
        return this;
    }

    sortByDescending() : DatabaseQuery<TRecord> {
        return this;
    }

    listAsync(parametersMap?: any): Promise<QueryResult<TRecord>> {
        throw Error();
    }
}
