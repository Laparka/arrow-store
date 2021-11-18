import {DynamoDBRecord, DynamoDBRecordIndex} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "./dynamoResolver";
import {DynamoDBFilterExpressionTransformer} from "../parser/filterExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import FilterExpressionParser from "../parser/filterExpressionParser";
import UpdateExpressionParser from "../parser/updateExpressionParser";
import {DynamoDBUpdateExpressionTransformer} from "../parser/updateExpressionTransformer";

export type UpdateBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord>,
    executeAsync(): Promise<boolean>,
    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>,
    delete<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord>,
    add<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord>,
};

export class DynamoDBUpdateBuilder<TRecord extends DynamoDBRecord> implements UpdateBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _filterTransformer: DynamoDBFilterExpressionTransformer;
    private readonly _updateTransformer: DynamoDBUpdateExpressionTransformer;
    private readonly _conditionExpressions: string[];
    private readonly _updateExpressions: string[];

    constructor(recordId: DynamoDBRecordIndex,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver)
    {
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._filterTransformer = new DynamoDBFilterExpressionTransformer("conditionParam");
        this._updateTransformer = new DynamoDBUpdateExpressionTransformer("updateParam");
        this._conditionExpressions = [];
        this._updateExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!predicate) {
            throw Error(`The condition expression is missing`);
        }

        const query = predicate.toString();
        if (!query) {
            throw Error(`The expression string is missing`);
        }

        if (!this._recordId || !this._recordId.getRecordTypeId) {
            throw Error(`The record ID or the getRecordTypeId function is not available`);
        }

        const typeId = this._recordId.getRecordTypeId();
        if (!typeId) {
            throw Error(`The record type ID is missing`);
        }

        const tokens = LambdaPredicateLexer.Instance.tokenize(query);
        const expression = FilterExpressionParser.Instance.parse(query, tokens);
        const readingSchema = this._schemaProvider.getReadingSchema(this._recordId.getRecordTypeId());
        this._conditionExpressions.push(this._filterTransformer.transform(readingSchema, expression, parametersMap));
        return this;
    }

    add<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The add expression is missing`);
        }

        const addQuery = expression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(addQuery);
        return this;
    }

    delete<TMember>(expression: (record: TRecord) => TMember): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The delete expression is missing`);
        }

        const deleteQuery = expression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(deleteQuery);
        return this;
    }

    update<TContext>(expression: (record: TRecord, context: TContext) => unknown, parametersMap?: TContext): UpdateBuilder<TRecord> {
        if (!expression) {
            throw Error(`The update expression is missing`);
        }

        const updateQuery = expression.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(updateQuery);
        const node = UpdateExpressionParser.Instance.parse(updateQuery, tokens);
        const writingSchema = this._schemaProvider.getWritingSchema(this._recordId.getRecordTypeId());
        this._updateExpressions.push(this._updateTransformer.transform(writingSchema, node, parametersMap))
        return this;
    }

    executeAsync(): Promise<boolean> {
        throw Error(`Not implemented`);
    }
}
