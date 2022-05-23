import {
    AttributeDescriptor, COMPARE_OPERATOR_TYPE,
    DynamoDBQueryResult,
    DynamoDBRecord,
    DynamoDBRecordIndex,
    DynamoDBRecordIndexBase, FUNCTION_OPERATOR_TYPE,
    PrimaryAttributeValue, PrimaryKeysMap
} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import WhereCauseExpressionParser from "../parser/whereCauseExpressionParser";
import {WhereCauseExpressionTransformer} from "../transformers/whereCauseExpressionTransformer";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {AttributeValue, QueryInput, QueryOutput} from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDB} from "aws-sdk";
import {ExpressionAttribute, ExpressionTransformer} from "../transformers/expressionTransformer";
import {AttributesBuilderBase} from "./attributesBuilderBase";

export type ListQueryBuilder<TRecord extends DynamoDBRecord> = {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): ListQueryBuilder<TRecord>,
    skipTo(recordId: DynamoDBRecordIndex): ListQueryBuilder<TRecord>,
    take(takeRecords: number): ListQueryBuilder<TRecord>,
    sortByAscending(): ListQueryBuilder<TRecord>,
    sortByDescending(): ListQueryBuilder<TRecord>,
    listAsync(): Promise<DynamoDBQueryResult<TRecord>>,
};

export class DynamoDBListQueryBuilder<TRecord extends DynamoDBRecord> extends AttributesBuilderBase implements ListQueryBuilder<TRecord> {
    private readonly _recordQuery: DynamoDBRecordIndexBase<TRecord>;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _expressionTransformer: ExpressionTransformer;

    private readonly _attributeNames: Map<string, string>;
    private readonly _attributeValues: Map<string, AttributeValue>;

    private readonly _filterExpressions: string[];
    private _scanIndexFwd: boolean = false;
    private _exclusiveStartKey: DynamoDB.Key | undefined;
    private _limit: number | undefined;

    constructor(recordQuery: DynamoDBRecordIndexBase<TRecord>,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super();
        this._recordQuery = recordQuery;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;

        this._attributeNames = new Map<string, string>();
        this._attributeValues = new Map<string, AttributeValue>();
        const attributeNameAliases = new Map<string, ExpressionAttribute>();
        const attributeValueAliases = new Map<string, string>();
        this._expressionTransformer = new WhereCauseExpressionTransformer("attr_name",
            this._attributeNames,
            attributeNameAliases,
            this._attributeValues,
            attributeValueAliases);
        this._filterExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): ListQueryBuilder<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = LambdaPredicateLexer.Instance.tokenize(query);
        const expression = WhereCauseExpressionParser.Instance.parse(query, tokens);
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
            ExclusiveStartKey: this._exclusiveStartKey,
            ConsistentRead: this._recordQuery.isConsistentRead(),
            ScanIndexForward: this._scanIndexFwd
        };

        queryInput.FilterExpression = this.joinFilterExpressions(this._filterExpressions);
        this.setExpressionAttributes(this._attributeNames, this._attributeValues, queryInput);
        const primaryKeys = this._recordQuery.getPrimaryKeys();
        if (!primaryKeys || primaryKeys.length === 0 || primaryKeys.length > 2) {
            throw Error(`The query attributes are missing`);
        }

        queryInput.KeyConditionExpression = this.toQueryKeyExpression(primaryKeys, queryInput);
        const client = this._clientResolver.resolve();
        let response: QueryOutput | null = null;
        const records: TRecord[] = [];
        const recordTypeId = this._recordQuery.getRecordTypeId();
        while (this._limit === undefined || records.length < this._limit) {
            response = await client.query(queryInput).promise();
            if (response.Items && response.Count && response.Count > 0) {
                response.Items.forEach(attribute => {
                    records.push(this._recordMapper.toRecord<TRecord>(this._recordQuery.getRecordType(), recordTypeId, attribute));
                });
            }

            if (response.LastEvaluatedKey) {
                queryInput.ExclusiveStartKey = response.LastEvaluatedKey;
                continue;
            }

            break;
        }

        return {
            lastKey: response ? this._fromLastEvaluatedKey(response.LastEvaluatedKey) : null,
            records: records
        }
    }

    private _fromLastEvaluatedKey(key: DynamoDB.Key | undefined) : PrimaryKeysMap | null {
        if (!key) {
            return null;
        }

        const attributeNames = Object.getOwnPropertyNames(key);
        if (attributeNames.length !== 2) {
            return null;
        }

        return {
            partition: this._toPrimaryKey(attributeNames[0], key[attributeNames[0]]),
            range: this._toPrimaryKey(attributeNames[0], key[attributeNames[1]])
        };
    }

    private _toPrimaryKey(attributeName: string, key: AttributeValue): AttributeDescriptor {
        const type = Object.getOwnPropertyNames(key)[0];
        return {
            getAttributeValue(): any {
                return key[type];
            },
            getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
                return <DYNAMODB_ATTRIBUTE_TYPE>type;
            },
            getAttributeName(): string {
                return attributeName;
            }
        };
    }
}
