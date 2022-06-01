import {
    AttributeDescriptor,
    DynamoDBQueryResult,
    DynamoDBRecord,
    DynamoDBRecordIndex,
    DynamoDBRecordIndexBase, PrimaryAttributeValue,
    PrimaryKeysMap
} from "../records/record";
import {DYNAMODB_ATTRIBUTE_TYPE, DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {AttributeValue, QueryInput, QueryOutput} from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDB} from "aws-sdk";
import {
    joinFilterExpressions,
    RequestInput,
    setExpressionAttributes, toKeyAttributeExpression
} from "./utils";
import {WhenExpressionBuilder} from "./batchWriteBuilder";

export type ListQueryBuilder<TRecord extends DynamoDBRecord> = {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): ListQueryBuilder<TRecord>,
    skipTo(recordId: DynamoDBRecordIndex): ListQueryBuilder<TRecord>,
    take(takeRecords: number): ListQueryBuilder<TRecord>,
    sortByAscending(): ListQueryBuilder<TRecord>,
    sortByDescending(): ListQueryBuilder<TRecord>,
    listAsync(): Promise<DynamoDBQueryResult<TRecord>>,
};

export class DynamoDBListQueryBuilder<TRecord extends DynamoDBRecord> extends WhenExpressionBuilder<TRecord> implements ListQueryBuilder<TRecord> {
    private readonly _recordQuery: DynamoDBRecordIndexBase<TRecord>;
    private readonly _clientResolver: DynamoDBClientResolver;

    private readonly _filterExpressions: string[];
    private _scanIndexFwd: boolean = false;
    private _exclusiveStartKey: DynamoDB.Key | undefined;
    private _limit: number | undefined;

    constructor(recordQuery: DynamoDBRecordIndexBase<TRecord>,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        super(recordQuery, schemaProvider, recordMapper);
        this._recordQuery = recordQuery;
        this._clientResolver = clientResolver;

        this._filterExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): ListQueryBuilder<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        this._filterExpressions.push(this.toWhereExpression(predicate, context));
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

        queryInput.FilterExpression = joinFilterExpressions(this._filterExpressions);
        setExpressionAttributes(this.attributeNames, this.attributeValues, queryInput);
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
                    if (attribute && Object.getOwnPropertyNames(attribute).length === 0) {
                        records.push(this._recordMapper.toRecord<TRecord>(this._recordQuery.getRecordType(), recordTypeId, attribute));
                    }
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

    private _toQueryKeyExpression(primaryKeys: ReadonlyArray<PrimaryAttributeValue>, input: RequestInput): string {
        const expressions: string[] = [];
        for (let i = 0; i < primaryKeys.length; i++) {
            expressions.push(toKeyAttributeExpression(primaryKeys[i], input));
        }

        return expressions.join(' AND ');
    }
}
