import {DynamoDBRecord, DynamoDBRecordIndex, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {AttributeValue, DeleteItemInput} from "aws-sdk/clients/dynamodb";
import {ExpressionAttribute, ExpressionTransformer} from "../transformers/expressionTransformer";
import {WhereCauseExpressionTransformer} from "../transformers/whereCauseExpressionTransformer";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import {AttributesBuilderBase} from "./attributesBuilderBase";

export type DeleteBuilder<TRecord extends DynamoDBRecord> = {
    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): DeleteBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};


export class DynamoDBDeleteItemBuilder<TRecord extends DynamoDBRecord> extends AttributesBuilderBase implements DeleteBuilder<TRecord> {
    private readonly _recordId: DynamoDBRecordIndex;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _conditionFilterTransformer: ExpressionTransformer;
    private readonly _conditionExpressions: string[];

    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeValues: Map<string, AttributeValue>;

    constructor(recordId: DynamoDBRecordIndexBase<TRecord>,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super();
        this._recordId = recordId;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._attributeNames = new Map<string, string>();
        this._attributeValues = new Map<string, AttributeValue>();
        const attributeNameAliases = new Map<string, ExpressionAttribute>();
        const attributeValueAliases = new Map<string, string>();
        this._conditionFilterTransformer = new WhereCauseExpressionTransformer("attr_name",
            this._attributeNames,
            attributeNameAliases,
            this._attributeValues,
            attributeValueAliases);
        this._conditionExpressions = [];
    }

    when<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap: TContext | undefined): DeleteBuilder<TRecord> {
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
        const expression = WhereCauseExpressionParser.Instance.parse(query, tokens);
        const readingSchema = this._schemaProvider.getReadingSchema(this._recordId.getRecordTypeId());
        this._conditionExpressions.push(this._conditionFilterTransformer.transform(readingSchema, expression, parametersMap));
        return this;
    }

    async executeAsync(): Promise<boolean> {
        const client = this._clientResolver.resolve();
        const deleteItemInput: DeleteItemInput = {
            Key: this._recordMapper.toKeyAttribute(this._recordId.getPrimaryKeys()),
            ReturnValues: "NONE",
            TableName: this._recordId.getTableName()
        };

        deleteItemInput.ConditionExpression = this.joinFilterExpressions(this._conditionExpressions);
        this.setExpressionAttributes(this._attributeNames, this._attributeValues, deleteItemInput);
        const response = await client.deleteItem(deleteItemInput).promise();
        return response?.$response?.httpResponse?.statusCode === 200;
    }

}