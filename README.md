# ArrowStore
```shell
npm i arrow-store
```

ArrowStore is an extensible TypeScript object-relational mapper for AWS DynamoDB that simplifies the DynamoDB API usage for developers.  
See the working version of [AWS Lambda Sample project](/samples) code to play and deploy in your environment.

ArrowStore allows developers to:
* Map a received set of DynamoDB AttributeValues to an object
* Map an object to a set of DynamoDB AttributeValues
* Query a table's partition with an optional sort key attribute and comparison operator and filter expressions
* Put, Delete and Update a record with an optional condition expression (e.g. atomic operation)
* Batch Put, Batch Delete and Batch Get records
* Transactional Put, Delete, Update records with optional condition expressions and condition expression for the whole transaction

## ArrowStore ORM Considerations
The library was created to make it easy for new developers to start working on your project without going to deep into AWS DynamoDB API.
* A basic understanding of the AWS DynamoDB is highly recommended to avoid common pitfalls.
* The ArrowStore library leverages AWS DynamoDB Low-Level API
* The ArrowStore's parser reads the ES6 arrow function - it stringifies the arrow function and builds an AST tree. Avoid using syntactic sugar, such as a question mark (?) when checking for an empty value or build an if-else statement. A JS transpiler will expand it to a function with a body and the ArrowStore's engine will not be able to build an AST Tree.
* No scopes are supported when passing an object's accessor value from a local scope. In the arrow function you must specify an object accessor and pass this object as an argument or use constant values without accessors
* Each requested object must have a mapping schema - from and to DynamoDB's AttributeValue. No raw-requests are supported
* Projections are not supported yet and, currently, there are no plans to implement it yet
* List (L), Binary (B) and Binary Set (BS) attribute values are not supported

## DynamoDB AttributeValue Mappings
Consider a JSON object example:
```
{
    "clockType": "Hybrid",
    "clockModel": "DW8F1",
    "brand": "Fossil",
    "regulatory": {
        "availableInCountries": ["USA", "CAN", "CHN"],
        "madeUtc": "2021-01-30T18:05:56.001Z",
        "partNumber": 106956,
        "isDemoVersion": false 
    }
}
```

# DynamoDB Requests
## GetItem
With the object defined above, we'll show you how to send a GetItem-request with the ArrowStore DynamoDB Client:

```typescript
import {DefaultDynamoDBClient, DynamoDBClientResolver} from "arrow-store";

class AppDynamoDBClientResolver implements DynamoDBClientResolver {
    resolve(): DynamoDB {
        config.update({region: 'us-west-2'});
        const credentials = new SharedIniFileCredentials({profile: 'arrow-store'});
        config.credentials = credentials;
        const client = new DynamoDB();
        return client;
    }
}

export async function getClockRecordAsync(clockModel: string): Promise<ClockRecord | null> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const record = await client.getAsync(new ClockRecordId(clockModel));
    return record;
} 
```
This operation will result in the following request:
```shell
aws dynamodb get-item \
  --table-name MyDynamoDBTable \
  --key '{"PartitionKey": {"S": "ClockRecord"}, "SecondaryKey": {"S": "DW8F1"}}'
```

## PutItem
```typescript
export async function putClockRecordAsync(clockRecord: ClockRecord): Promise {
const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
const isSaved = await dynamoService
    .put(clockRecord)
    .when(x => !x.clockModel)
    .executeAsync();
} 
```
The putClockRecordAsync-method call will result in:
```shell
aws dynamodb put-item \
  --table-name MyDynamoDBTable \
  --condition-expression "attribute_not_exists(SecondaryKey)" \
  --item file://item.json
```

## UpdateItem
```typescript
export async function updateClockRecordAsync(clockRecordId: ClockRecordId): Promise {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {countries: ["ITL"]};
    const updated = await dynamoService
        .update(clockRecordId)
        .when(x => !!x.regulatory.madeUtc)
        .set((x, ctx) => x.regulatory.availableInCountries.push(...ctx.countries), params)
        .setWhenNotExists(x => x.regulatory.isDemoVersion, x => x.regulatory.isDemoVersion = true)
        .set(x => x.clockType = "Analog")
        .set(x => x.partNumber += 5)
        .destroy(x => x.regulatory.madeUtc)
        .executeAsync();
}
```
The updateClockRecordAsync-method call will result in:
```shell
aws dynamodb update-item \
  --table-name MyDynamoDBTable \
  --key '{"PartitionKey": {"S": "ClockRecord"}, "SecondaryKey": {"S": "DW8F1"}}'
  --condition-expression "attribute_exists(#attr_0.#attr_1.#attr_2)"
  --update-expression "ADD #attr_0.#attr_1.#attr_3 :attr_val_0,
                           #attr_0.#attr_1.#attr_5 :attr_val_3
                       SET #attr_0.#attr_1.#attr_6 = if_not_exists(#attr_0.#attr_1.#attr_6, :attr_val_1)",
                           #attr_0.#attr_4 = :attr_val_2
                       REMOVE #attr_0.#attr_1.#attr_2
  --expression-attribute-names file://attr-names.json
  --expression-attribute-values file://attr-values.json
  
```
./attr-names.json:
```json
{
  "#attr_0": "RECORD_DATA",
  "#attr_1": "REGULATORY",
  "#attr_2": "MADE_DATE_UTC",
  "#attr_3": "AVAILABLE_IN_COUNTRIES",
  "#attr_4": "CLOCK_TYPE",
  "#attr_5": "PART_NUMBER",
  "#attr_6": "IS_DEMO"
}
```

./attr-values.json
```json
{
  ":attr_val_0": {
    "SS": ["ITL"]
  },
  ":attr_val_1": {
    "BOOL": true
  },
  ":attr_val_2": {
    "S": "Analog"
  },
  ":attr_val_3": {
    "N": "5"
  }
}
```

The same call outcome but with expanded attribute names and values for a better readability:
```shell
aws dynamodb update-item \
  --table-name MyDynamoDBTable \
  --key '{"PartitionKey": {"S": "ClockRecord"}, "SecondaryKey": {"S": "DW8F1"}}'
  --condition-expression "attribute_exists(RECORD_DATA.REGULATORY.MADE_DATE_UTC)"
  --update-expression 'ADD RECORD_DATA.REGULATORY.AVAILABLE_IN_COUNTRIES {"SS": ["ITL"]},
                           RECORD_DATA.REGULATORY.PART_NUMBER {"N": "5"}
                       SET RECORD_DATA.REGULATORY.IS_DEMO = if_not_exists(RECORD_DATA.REGULATORY.IS_DEMO, {"BOOL": true}),
                           RECORD_DATA.CLOCK_TYPE = {"S": "Analog"}
                       REMOVE RECORD_DATA.REGULATORY.MADE_DATE_UTC'
```

## DeleteItem
```typescript
export async function deleteItemAsync(clockRecordId: ClockRecordId): Promise<void> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const removed = await dynamoService
        .delete(clockRecordId)
        .when(x => !!x.regulatory.isDemoVersion || x.clockType === "Analog")
        .executeAsync();
}
```
The outcome:
```shell
aws dynamodb delete-item \
  --table-name MyDynamoDBTable \
  --key '{"PartitionKey": {"S": "ClockRecord"}, "SecondaryKey": {"S": "DW8F1"}}'
  --condition-expression 'attribute_exists(RECORD_DATA.REGULATORY.IS_DEMO) OR RECORD_DATA.CLOCK_TYPE = {'S": "Analog'}'
```

## Query
```typescript
export class ClockRecordsQuery implements ArrowStoreTypeRecordId<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordTypeId(): string {
        return RECORD_TYPES.ClockRecord;
    }

    getCtor(): ArrowStoreRecordCtor<ClockRecord> {
        return ClockRecord;
    }

    getIndexName(): string | undefined {
        return undefined;
    }

    isConsistentRead(): boolean {
        return false;
    }

    getTableName(): string {
        return "MyDynamoDBTable";
    }
} 
```

```typescript
import {ClockRecordsQuery} from "./models";

export async function queryClockRecordsAsync(): Promise<ClockRecord[]> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const queryResult = await dynamoService
        .query(new ClockRecordsQuery())
        .where(x => x.brand.startsWith("F") && x.regulatory.isDemoVersion && x.regulatory.availableInCountries.includes("USA"))
        .executeAsync();
    
    return queryResult.records;
}
```

Will result in:
```shell
aws dynamodb query \
  --table-name MyDynamoDBTable
  --key-condition-expression 'PartitionKey = :attr_val_0' \
  --filter-expression 'begins_with(RECORD_DATA.BRAND, :attr_val_1 AND RECORD_DATA.REGULATORY.IS_DEMO = :attr_val_2 AND contains(RECORD_DATA.REGULATORY.AVAILABLE_IN_COUNTRIES, :attr_val_3))'
  --expression-attribute-values  '{":attr_val_0":{"S":"ClockRecord"}, ":attr_val_1": {"S": "F"}, ":attr_val_2": {"BOOL": true}, ":attr_val_3": {"S": "USA"}}'
```
## BatchGetItem
```typescript
export async function batchGetAsync(recordIds: ArrowStoreRecordId[]): Promise<DynamoDBRecord[]> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    return await client.batchGetAsync(recordIds);
}
```
In this BatchGetItems example, the DynamoDBService call of batchGetAsync returns the requested records, and also populate the array of GetRecordInBatchRequest with the result per requested ID for convenience.

## BatchWriteItem

```typescript
import {DynamoDBRecordIndex} from "./record";

export async function batchWriteAsync(putRecord: ArrowStoreRecord, deleteRecordId: ArrowStoreRecordId): Promise<void> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    await client.batchWriteAsync(writer => writer.put(record).delete(deleteRecordId));
}
```

## TransactWriteItem
```typescript
export async function transactWriteAsync(putRecord: ArrowStoreRecord, deleteRecordId: ArrowStoreRecordId): Promise<void> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    await client
        .transactWriteItems("some-idempotency-key")
        .when(new ClockRecordId("DW"), x => x.clockType === "Digital")
        .delete(new ClockRecordId("CAS123"), deleteCondition => deleteCondition.when(x => !!x.clockType))
        .put(clockRecord, putCondition => putCondition.when(x => !!x.clockType))
        .update(new ClockRecordId("UNKNOWN"), updater => {
            updater
                .set(x => x.clockType = "Analog")
                .destroy(x => x.isDemoVersion)
                .when(x => x.clockType === "Digital");
        })
        .executeAsync();
}
```

## TransactGetItem
```typescript
export async function transactGetAsync(recordIds: ArrowStoreRecordId[]): Promise<any[]> {
    const client = new DefaultDynamoDBClient(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    return await client.transactGetItemsAsync(recordIds);
}
```
## Function Expressions
| AWS DynamoDB Expression                                                                                                                                     | Arrow Function                                                                                                                                        |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| attribute_exists(_path_)                                                                                                                                    | query => !!query.member<br/>query => !!query.booleanMember                                                                                            |
| attribute_not_exists(_path_)                                                                                                                                | query => !query.member<br/>query => !!!query.booleanMember                                                                                            |
| begins_with(_path_, _substr_)                                                                                                                               | query => query.stringMember.startsWith("_substr_")                                                                                                    |
| not begins_with(_path_, _substr_)                                                                                                                           | query => query.stringMember.startsWith("_substr_")                                                                                                    |
| contains(#string_set_attr, :v_colors)<br/>attributeNames: {<br/>#string_set_attr: "COLORS"<br/>}<br/>attributeValues: {<br/>":v_colors": {"S": "Red"}<br/>} | query => query.colorsSet.contains("Red")                                                                                                              |
| contains(#string_attr, :v_sub)<br/>attributeNames: {<br/>#string_attr: "NAME"<br/>}<br/>attributeValues: {<br/>":v_sub": {"S": "the"}<br/>}                 | query => query.stringMember.contains("the")                                                                                                           |
| size(_path_) = :v_num                                                                                                                                       | query => Checks the string length: ```query.stringMember.length === 10```<br/>Checks the string set size: ```query => query.colorsSet.length === 3``` |


## Update Expressions
| AWS DynamoDB Expression                                                                    | Arrow Function                                                                        |
|--------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| SET Price = Price - :p<br/>where {":p": {"N": "5"}}                                        | updater => updater.set(x => x.price = x.price - 5)                                    |
| SET Colors = list_append(Colors, :v_colors)<br/>where {":v_colors": {"L": [{"S": "Red"}]}} | updater => updater.set(x => x.colors = x.colors.concat('Red'))                        |
| SET Colors = list_append(:v_colors, Colors)<br/>where {":v_colors": {"L": [{"S": "Red"}]}} | updater => updater.set((x, ctx) => x.colors = ctx.additionalColors.concat(x.colors))  |
| ADD Colors :v_colors<br/>where {":v_colors": {"S": "Red"}}                                 | updater => updater.set(x => x.colors.push("Red")                                      |
| REMOVE Colors[0], Colors[1]                                                                | updater => updater.set(x => x.colors.splice(0, 1)                                     |
| DELETE Color :v_colors                                                                     | *IN PROGRESS*                                                                         |