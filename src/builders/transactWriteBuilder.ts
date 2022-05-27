import {DynamoDBRecord, DynamoDBRecordIndex, DynamoDBRecordIndexBase} from "../records/record";
import {DynamoDBSchemaProvider} from "../mappers/schemaBuilders";
import {DynamoDBRecordMapper} from "../mappers/recordMapper";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {ConditionCheck, TransactWriteItemList} from "aws-sdk/clients/dynamodb";
import {DynamoDBTransactUpdateItemBuilder, DynamoDBUpdateBuilder, TransactUpdateItemBuilder} from "./updateBuilder";
import {DynamoDBTransactPutItemBuilder, TransactPutItemBuilder} from "./putBuilder";
import {DynamoDBBatchDeleteItemBuilder, TransactDeleteItemBuilder} from "./deleteBuilder";
import {WhenExpressionBuilder} from "./batchWriteBuilder";
import {setExpressionAttributes} from "./utils";

export type TransactWriteBuilder = {
    when<TRecord extends DynamoDBRecord, TContext>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): TransactWriteBuilder;
    delete<TRecord extends DynamoDBRecord, TContext>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, deleteBuilder?: (query: TransactDeleteItemBuilder<TRecord>) => void): TransactWriteBuilder;
    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, updateBuilder: (query: TransactUpdateItemBuilder<TRecord>) => void): TransactWriteBuilder;
    put<TRecord extends DynamoDBRecord, TContext>(record: TRecord, putBuilder?: (query: TransactPutItemBuilder<TRecord>) => void): TransactWriteBuilder;
    executeAsync(): Promise<void>;
};

export class DynamoDBTransactWriteItemBuilder implements TransactWriteBuilder {
    private readonly _schemaProvider: DynamoDBSchemaProvider;
    private readonly _recordMapper: DynamoDBRecordMapper;
    private readonly _clientResolver: DynamoDBClientResolver;
    private readonly _clientRequestToken: string | undefined;

    private readonly _transactWriteItems: TransactWriteItemList;

    constructor(schemaProvider: DynamoDBSchemaProvider,
                recordMapper: DynamoDBRecordMapper,
                clientResolver: DynamoDBClientResolver,
                clientRequestToken?: string) {
        this._schemaProvider = schemaProvider;
        this._recordMapper = recordMapper;
        this._clientResolver = clientResolver;
        this._clientRequestToken = clientRequestToken;
        this._transactWriteItems = [];
    }

    when<TRecord extends DynamoDBRecord, TContext>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, predicate: (record: TRecord, context: TContext) => boolean, context?: TContext): TransactWriteBuilder {
        const whenBuilder = new WhenExpressionBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper);
        const condition: ConditionCheck = {
            Key: this._recordMapper.toKeyAttribute(recordId.getPrimaryKeys()),
            TableName: recordId.getTableName(),
            ConditionExpression: whenBuilder.toWhereExpression(predicate, context),
            ReturnValuesOnConditionCheckFailure: "NONE"
        };

        setExpressionAttributes(whenBuilder.attributeNames, whenBuilder.attributeValues, condition);
        this._transactWriteItems.push({
            ConditionCheck: condition
        });

        return this;
    }

    delete<TRecord extends DynamoDBRecord, TContext>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, deleteBuilder?: (query: TransactDeleteItemBuilder<TRecord>) => void): TransactWriteBuilder {
        const builder = new DynamoDBBatchDeleteItemBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper);
        if (deleteBuilder) {
            deleteBuilder(builder);
        }

        this._transactWriteItems.push({Delete: builder.build()});
        return this;
    }

    update<TRecord extends DynamoDBRecord>(recordId: DynamoDBRecordIndex | DynamoDBRecordIndexBase<TRecord>, updateBuilder: (query: TransactUpdateItemBuilder<TRecord>) => void): TransactWriteBuilder {
        const builder = new DynamoDBTransactUpdateItemBuilder<TRecord>(recordId, this._schemaProvider, this._recordMapper);
        if (builder) {
            updateBuilder(builder);
        }

        this._transactWriteItems.push({
            Update: builder.build()
        });
        return this;
    }

    put<TRecord extends DynamoDBRecord, TContext>(record: TRecord, putBuilder?: (query: TransactPutItemBuilder<TRecord>) => void): TransactWriteBuilder {
        const builder = new DynamoDBTransactPutItemBuilder<TRecord>(record, this._schemaProvider, this._recordMapper);
        if (putBuilder) {
            putBuilder(builder);
        }

        this._transactWriteItems.push({
            Put: builder.build()
        });

        return this;
    }

    async executeAsync(): Promise<void> {
        if (this._transactWriteItems.length === 0) {
            throw Error(`No transactions to execute`);
        }

        const client = this._clientResolver.resolve();
        const response = await client.transactWriteItems({
            ClientRequestToken: this._clientRequestToken,
            TransactItems: this._transactWriteItems,
            ReturnItemCollectionMetrics: "NONE",
            ReturnConsumedCapacity: "NONE"
        }).promise();
        console.log(response);
    }
};