import {
    DynamoDBQueryResult,
    DynamoDBRecord,
    DynamoDBRecordIndexBase,
    DynamoDBPrimaryAttribute, COMPARE_OPERATOR_TYPE
} from "../records/record";
import LambdaPredicateLexer from "../lexer/lambdaPredicateLexer";
import PredicateExpressionParser from "../parser/predicateExpressionParser";
import {DynamoDBExpressionTransformer} from "../parser/expressionTransformer";
import {DynamoDBAttributeSchema, DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {AttributeValue, QueryInput} from 'aws-sdk/clients/dynamodb'
import {DynamoDBClientResolver} from "./dynamoResolver";
import {
    BooleanOperationNode,
    CompareOperationNode,
    FunctionNode,
    ObjectAccessorNode,
    ParserNode
} from "../parser/nodes";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";


export class DynamoQuery<TRecord extends DynamoDBRecord> {
    private static readonly _Lexer = new LambdaPredicateLexer();
    private static readonly _Parser = new PredicateExpressionParser();

    private readonly _recordQuery: DynamoDBRecordIndexBase<TRecord>;
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;


    private readonly _filterExpressions: string[];
    private _expressionTransformer: DynamoDBExpressionTransformer | undefined;
    private _scanIndexFwd: boolean = false;
    private _exclusiveStartKey: ReadonlyArray<DynamoDBPrimaryAttribute> | undefined;
    private _limit: number | undefined;

    constructor(recordQuery: DynamoDBRecordIndexBase<TRecord>,
                schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver) {
        this._recordQuery = recordQuery;
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._filterExpressions = [];
    }

    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext) : DynamoQuery<TRecord> {
        if (!predicate) {
            throw Error(`where-clause predicate is missing`);
        }

        const query = predicate.toString();
        const tokens = DynamoQuery._Lexer.tokenize(query);
        const expression = DynamoQuery._Parser.parse(query, tokens);
        const transformer = this._getExpressionTransformer();
        this._filterExpressions.push(transformer.transform(expression, parametersMap));
        return this;
    }

    skipTo(recordId: DynamoDBRecordIndexBase<TRecord>) : DynamoQuery<TRecord> {
        if (!recordId) {
            throw Error(`The recordId is missing`)
        }

        const primaryKeys = recordId.getPrimaryKeys();
        if (!primaryKeys || primaryKeys.length !== 2) {
            throw Error(`The recordId must return both - the partition and range keys`);
        }

        if (primaryKeys.findIndex(x => !x.name || !x.value || x.operator !== "Equals") >= 0) {
            throw Error(`Invalid partition or range key is provided for the exclusiveStartKey`);
        }

        this._exclusiveStartKey = primaryKeys;
        return this;
    }

    take(takeRecords: number) : DynamoQuery<TRecord> {
        if (takeRecords <= 0) {
            throw Error(`The takeRecords argument must be greater than zero`);
        }

        this._limit = takeRecords;
        return this;
    }

    sortByAscending() : DynamoQuery<TRecord>{
        this._scanIndexFwd = true;
        return this;
    }

    sortByDescending() : DynamoQuery<TRecord> {
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
            ExpressionAttributeValues: {}
        };

        this._filterExpressions.forEach(filterExp => {
            if (queryInput.FilterExpression) {
                queryInput.FilterExpression = `(${queryInput.FilterExpression}) AND (${filterExp})`;
            }
            else {
                queryInput.FilterExpression = filterExp;
            }
        });

        this._getExpressionTransformer().expressionAttributeValues.forEach((value, key) => {
            queryInput.ExpressionAttributeValues![key] = value;
        });

        if (this._exclusiveStartKey) {
            this._exclusiveStartKey.forEach(startKey => {
                if (!queryInput.ExclusiveStartKey) {
                    queryInput.ExclusiveStartKey = {};
                }

                const attributeValue: AttributeValue = {};
                (<any>attributeValue)[startKey.valueType] = startKey.value;
                queryInput.ExclusiveStartKey[startKey.name] = attributeValue;
            });
        }

        const primaryKeys = this._recordQuery.getPrimaryKeys();
        if (!primaryKeys || primaryKeys.length === 0 || primaryKeys.length > 2) {
            throw Error(`The query attributes are missing`);
        }

        const keyExpression = this._transformKeys(primaryKeys);
        queryInput.KeyConditionExpression = keyExpression[0];
        keyExpression[1].forEach((value, key) => {
            queryInput.ExpressionAttributeValues![key] = value;
        })
        const client = this._clientResolver.resolve();
        const response = await client.query(queryInput).promise();
        const records: TRecord[] = [];
        if (response.Items && response.Count && response.Count > 0) {
            const recordTypeId = this._recordQuery.getRecordTypeId();
            response.Items.forEach(attribute => {
                records.push(this._recordMapper.mapAttributes<TRecord>(recordTypeId, attribute));
            })
        }

        return {
            lastKey: null,
            total: response.Count || 0,
            records: records
        }
    }

    private _transformKeys(queryKeys: ReadonlyArray<DynamoDBPrimaryAttribute>): [string, ReadonlyMap<string, AttributeValue>] {
        const dummySchema: ReadonlyMap<string, DynamoDBAttributeSchema> = new Map<string, DynamoDBAttributeSchema>();
        const keyExpressionTransformer = new DynamoDBExpressionTransformer(dummySchema, "primary");
        const expressions: ParserNode[] = [];
        for (let i = 0; i < queryKeys.length; i++) {
            const key = queryKeys[i];
            let node: ParserNode;
            const attributeNode = new ObjectAccessorNode(key.name);
            const valueNode = keyExpressionTransformer.toValueNode(key.valueType, key.value);
            const functionName = keyExpressionTransformer.tryGetFunctionName(key.operator);
            if (functionName) {
                node = new FunctionNode(functionName, attributeNode, valueNode)
            }
            else {
                node = new CompareOperationNode(<COMPARE_OPERATOR_TYPE>key.operator, attributeNode, valueNode);
            }

            expressions.push(node);
        }

        let evaluateNode: ParserNode;
        if (expressions.length === 2) {
            evaluateNode = new BooleanOperationNode("And", expressions[0], expressions[1])
        }
        else if (expressions.length === 1) {
            evaluateNode = expressions[0];
        }
        else {
            throw Error(`One or two query keys are required, but received ${expressions.length}`);
        }

        const keyExpression = keyExpressionTransformer.transform(evaluateNode);
        return [keyExpression, keyExpressionTransformer.expressionAttributeValues];
    }

    private _getExpressionTransformer(): DynamoDBExpressionTransformer {
        if (!this._expressionTransformer) {
            const readingSchema = this._schemaProvider.getReadingSchema(this._recordQuery.getRecordTypeId());
            this._expressionTransformer = new DynamoDBExpressionTransformer(readingSchema)
        }

        return this._expressionTransformer;
    }
}
