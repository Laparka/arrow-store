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

export type ListQueryBuilder<TRecord extends DynamoDBRecord> = {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): ListQueryBuilder<TRecord>,
    skipTo(recordId: DynamoDBRecordIndex): ListQueryBuilder<TRecord>,
    take(takeRecords: number): ListQueryBuilder<TRecord>,
    sortByAscending(): ListQueryBuilder<TRecord>,
    sortByDescending(): ListQueryBuilder<TRecord>,
    listAsync(): Promise<DynamoDBQueryResult<TRecord>>,
};

export class DynamoDBListQueryBuilder<TRecord extends DynamoDBRecord> implements ListQueryBuilder<TRecord> {
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

        if (this._filterExpressions.length === 1) {
            queryInput.FilterExpression = this._filterExpressions[0];
        }
        else {
            queryInput.FilterExpression = this._filterExpressions.map(filter => `(${filter})`).join(' AND ');
        }

        if (this._attributeNames.size !== 0) {
            queryInput.ExpressionAttributeNames = {};
            const iterator = this._attributeNames.keys();
            let attributeName = iterator.next();
            while(!attributeName.done) {
                queryInput.ExpressionAttributeNames[this._attributeNames.get(attributeName.value)!] = attributeName.value;
                attributeName = iterator.next();
            }
        }

        if (this._attributeValues.size !== 0) {
            queryInput.ExpressionAttributeValues = {};
            const iterator = this._attributeValues.keys();
            let attributeValueRef = iterator.next();
            while(!attributeValueRef.done) {
                queryInput.ExpressionAttributeValues[attributeValueRef.value] = this._attributeValues.get(attributeValueRef.value)!;
                attributeValueRef = iterator.next();
            }
        }

        const primaryKeys = this._recordQuery.getPrimaryKeys();
        if (!primaryKeys || primaryKeys.length === 0 || primaryKeys.length > 2) {
            throw Error(`The query attributes are missing`);
        }

        queryInput.KeyConditionExpression = this._toQueryKeyExpression(primaryKeys, queryInput);

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

    private _toQueryKeyExpression(primaryKeys: ReadonlyArray<PrimaryAttributeValue>, input: QueryInput): string {
        const expressions: string[] = [];
        for (let i = 0; i < primaryKeys.length; i++) {
            expressions.push(this._toKeyAttributeExpression(primaryKeys[i], input));
        }

        return expressions.join(' AND ');
    }

    private _toKeyAttributeExpression(attributeValue: PrimaryAttributeValue, input: QueryInput): string {
        const attribute: AttributeValue = {};
        attribute[attributeValue.getAttributeType()] = attributeValue.getAttributeValue();
        const key = `:${attributeValue.getPrimaryKeyType().toLowerCase()}`;
        if (!input.ExpressionAttributeValues) {
            input.ExpressionAttributeValues = {};
        }

        input.ExpressionAttributeValues[key] = attribute;
        if (!input.ExpressionAttributeNames) {
            input.ExpressionAttributeNames = {};
        }

        const attributeName = `#partition_key_${Object.getOwnPropertyNames(input.ExpressionAttributeNames).length}`;
        input.ExpressionAttributeNames[attributeName] = attributeValue.getAttributeName();
        return this._toDynamoDBCompare(attributeName, key, attributeValue.getCompareOperator());
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

    private _toDynamoDBCompare(attributeName: string, value: string, compareOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE): string {
        let operator: string;
        switch (compareOperator) {
            case "LessThanOrEquals": {
                operator = "<=";
                break;
            }
            case "LessThan": {
                operator = "<";
                break;
            }
            case "GreaterThan": {
                operator = ">";
                break;
            }
            case "GreaterThanOrEquals": {
                operator = ">=";
                break;
            }
            case "Equals": {
                operator = "=";
                break;
            }
            case "NotEquals": {
                operator = "!=";
                break;
            }

            case "BeginsWith": {
                return `begins_with(${attributeName}, ${value})`;
            }
            case "Contains": {
                return `contains(${attributeName}, ${value})`;
            }
            default: {
                throw Error(`Not supported operator ${compareOperator}`);
            }
        }

        return `${attributeName} ${operator} ${value}`;
    }
}
