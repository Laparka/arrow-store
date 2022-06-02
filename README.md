# ArrowStore

ArrowStore is an extensible TypeScript object-relational mapper for AWS DynamoDB that simplifies the DynamoDB API usage for developers.  

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
* Projections are not supported yet, since I never needed it
* Each requested object must have a mapping schema - from and to DynamoDB's AttributeValue. No raw-requests are supported 

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
The library works with the objects which implement the DynamoDBRecord type:
```typescript
export class PartitionKey implements PrimaryAttributeValue {
    private readonly _value: string;

    constructor(value: string) {
        this._value = value;
    }

    getAttributeName(): string {
        return "PrimaryKey";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): any {
        return this._value;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return "Equals";
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Partition";
    }
}

export class RangeKey implements PrimaryAttributeValue {
    private readonly _value: string;
    private readonly _comparisonOperator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE;

    constructor(sortValue: string, operator: COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE = 'Equals') {
        this._value = sortValue;
        this._comparisonOperator = operator;
    }

    getAttributeName(): string {
        return "SecondaryKey";
    }

    getAttributeType(): DYNAMODB_ATTRIBUTE_TYPE {
        return "S";
    }

    getAttributeValue(): any {
        return this._value;
    }

    getCompareOperator(): COMPARE_OPERATOR_TYPE | FUNCTION_OPERATOR_TYPE {
        return this._comparisonOperator;
    }

    getPrimaryKeyType(): PRIMARY_ATTRIBUTE_TYPE {
        return "Range";
    }
}

export class ClockRecordId extends DynamoDBRecordIndexBase<ClockRecord> {
    private readonly _clockId: string;

    constructor(clockId: string) {
        super();
        this._clockId = clockId;
    }

    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        if (!this._clockId) {
            throw Error(`The ClockId is missing`);
        }
        
        return [
            new PartitionKey('ClockRecord'),
            new RangeKey(this._clockId)];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    getRecordType(): Ctor<ClockRecord> {
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
export class ClockRecord extends DynamoDBRecordBase<ClockRecordId> {
    clockType: string;
    clockModel: string;
    brand: string;
    regulatory: ClockDetails;

    protected doGetRecordId(): ClockRecordId {
        if (!this.clockModel) {
            throw Error(`The clockModel value is missing`)
        }

        return new ClockRecordId(this.clockModel);
    }
}

export type ClockDetails = {
    availableInCountries: string[];
    madeUtc: string;
    partNumber: number;
    isDemoVersion: boolean;
}
```
To save to DynamoDB as a set of AttributeValues we need a Partition and Range/Sort key and the rest of attribute values. We can accomplish this by building a writing schema using a schema builder or provide a schema source:
### Writing and Reading Schema Builder Example
In this example, we want to provide a writing mapping schema using a built-in builder.
First, we create a mapping profile and provide the writing mapping schema:
```typescript
import {ClockRecord, RECORD_TYPES} from "./models";
import {DynamoDBMappingProfile, MappingBuilder} from "arrow-store";

export class ClockRecordMappingProfile implements DynamoDBMappingProfile {
  register(builder: MappingBuilder): void {
    builder
      .createWriterFor<ClockRecord>(RECORD_TYPES.ClockRecord)
      .forMember(x => x.brand, writer => writer.asString("RECORD_DATA.BRAND"))
      .forMember(x => x.clockType, writer => writer.asString("RECORD_DATA.CLOCK_TYPE"))
      .forMember(x => x.regulatory, writer => writer.asObject("RECORD_DATA.REGULATORY", nested =>
        nested
          .forMember(x => x.availableInCountries, nestedWriter => nestedWriter.asStringsList("AVAILABLE_IN_COUNTRIES"))
          .forMember(x => x.madeUtc, nestedWriter => nestedWriter.asString("MADE_DATE_UTC"))
          .forMember(x => x.isDemoVersion, nestedWriter => nestedWriter.asBool("IS_DEMO"))
          .forMember(x => x.partNumber, nestedWriter => nestedWriter.asNumber("SERIAL_NUMBER"))));

      builder
          .createReaderFor<ClockRecord>(RECORD_TYPES.ClockRecord)
          .forMember(x => x.clockModel, reader => reader.asString("SecondaryKey"))
          .forMember(x => x.brand, reader => reader.asString("RECORD_DATA.BRAND"))
          .forMember(x => x.clockType, reader => reader.asString("RECORD_DATA.CLOCK_TYPE"))
          .forMember(x => x.regulatory, reader => reader.asObject("RECORD_DATA.REGULATORY", nested =>
              nested
                  .forMember(x => x.availableInCountries, nestedReader => nestedReader.asStringsList("AVAILABLE_IN_COUNTRIES"))
                  .forMember(x => x.madeUtc, nestedReader => nestedReader.asString("MADE_DATE_UTC"))
                  .forMember(x => x.isDemoVersion, nestedReader => nestedReader.asBool("IS_DEMO"))
                  .forMember(x => x.partNumber, nestedReader => nestedReader.asNumber("SERIAL_NUMBER"))));
  }
}
```
Next, we must add this mapping profile to a builder's pipeline and build the schema provider:
```typescript
const schemaBuilder = new DynamoDBMappingBuilder();
const clockRecordMappingProfile = new ClockRecordMappingProfile();
clockRecordMappingProfile.register(schemaBuilder);
const schemaProvider = schemaBuilder.buildSchemaProvider();
```
### Writing and Reading Schema Using a Schema Source
If we don't want to use a schema builder, we may provide the mapping directly using a schema source:
> **NOTE**: You can see that each attribute schema has the lastChildAttributeType-field, which is important for the DynamoDB expression parser to add expression attribute values with the right DynamoDB Attribute Type (N, S, NS, SS, L, BOOL, M, NULL, etc.)
```typescript
import {ClockRecord} from "./models";
import {DynamoDBAttributeSchema, DynamoDBRecordSchemaSourceBase} from "arrow-store";

export class ClockRecordSchemaSource extends DynamoDBRecordSchemaSourceBase<ClockRecord> {
    getWritingSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this.getSchema();
    }

    getSchema(): Map<string, DynamoDBAttributeSchema> {
        return new Map<string, DynamoDBAttributeSchema>([
            ["clockType", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "CLOCK_TYPE",
                    attributeType: "S",
                    lastChildAttributeType: "S"
                }
            }],
            ["brand", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "BRAND",
                    attributeType: "S",
                    lastChildAttributeType: "S"
                }
            }],
            ["regulatory", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "M",
                nested: {
                    attributeName: "REGULATORY",
                    attributeType: "M",
                    lastChildAttributeType: "M"
                }
            }],
            ["regulatory.madeUtc", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "S",
                nested: {
                    attributeName: "REGULATORY",
                    attributeType: "M",
                    lastChildAttributeType: "S",
                    nested: {
                        attributeName: "MADE_DATE_UTC",
                        attributeType: "S",
                        lastChildAttributeType: "S"
                    }
                }
            }],
            ["regulatory.availableInCountries", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "SS",
                nested: {
                    attributeName: "REGULATORY",
                    attributeType: "M",
                    lastChildAttributeType: "SS",
                    nested: {
                        attributeName: "AVAILABLE_IN_COUNTRIES",
                        attributeType: "SS",
                        lastChildAttributeType: "SS"
                    }
                }
            }],
            ["regulatory.isDemoVersion", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "BOOL",
                nested: {
                    attributeName: "REGULATORY",
                    attributeType: "M",
                    lastChildAttributeType: "SS",
                    nested: {
                        attributeName: "IS_DEMO",
                        attributeType: "BOOL",
                        lastChildAttributeType: "BOOL"
                    }
                }
            }],
            ["regulatory.partNumber", {
                attributeName: "RECORD_DATA",
                attributeType: "M",
                lastChildAttributeType: "N",
                nested: {
                    attributeName: "REGULATORY",
                    attributeType: "M",
                    lastChildAttributeType: "N",
                    nested: {
                        attributeName: "PART_NUMBER",
                        attributeType: "N",
                        lastChildAttributeType: "N"
                    }
                }
            }]
        ]);
    }
}
```

Next, the schema source must be added to the mapping builder and receive the schema provider:
```typescript
const schemaBuilder = new DynamoDBMappingBuilder();
schemaBuilder.use(RECORD_TYPES.ClockRecord, new ClockRecordSchemaSource())
const schemaProvider = schemaBuilder.buildSchemaProvider();
```

Now, when the schema provider is built, we can use it for the DynamoDBService to write and read data to and from DynamoDB Table

# DynamoDB Requests
## GetItem
With the object defined above, we'll show you how to send a GetItem-request with the ArrowStore DynamoDB Client:
```typescript
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
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
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
const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
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
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {countries: ["ITL"]};
    const updated = await dynamoService.update(clockRecordId)
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
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
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
export class ClockRecordsQuery extends DynamoDBRecordIndexBase<ClockRecord> {
    getPrimaryKeys(): ReadonlyArray<PrimaryAttributeValue> {
        return [new PartitionKey('ClockRecord')];
    }

    getRecordTypeId(): symbol {
        return RECORD_TYPES.ClockRecord;
    }

    getRecordType(): Ctor<ClockRecord> {
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
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
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
export async function batchGetAsync(recordIds: DynamoDBRecordIndex[]): Promise<DynamoDBRecord[]> {
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const getRequests: GetRecordInBatchRequest[] = recordIds.map(r => {
        recordId: r
    });
    
    return await client.batchGetAsync(getRequests);
}
```
In this BatchGetItems example, the DynamoDBService call of batchGetAsync returns the requested records, and also populate the array of GetRecordInBatchRequest with the result per requested ID for convenience.

## BatchWriteItem

```typescript
import {DynamoDBRecordIndex} from "./record";

export async function batchWriteAsync(putRecord: DynamoDBRecord, deleteRecordId: DynamoDBRecordIndex): Promise<void> {
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    await client.batchWriteAsync(writer => writer.put(record).delete(deleteRecordId));
}
```

## TransactWriteItem
```typescript
export async function transactWriteAsync(putRecord: DynamoDBRecord, deleteRecordId: DynamoDBRecordIndex): Promise<void> {
    const client = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    await client.transactWriteItems("some-idempotency-key")
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

## TransactGetItem (not implemented yet)
```typescript
IN PROGRESS
```
#Function Expressions
| AWS DynamoDB Expression                                                                                                                                     | Arrow Function                                                                                                                                  |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| attribute_exists(_path_)                                                                                                                                    | query => !!query.member<br/>query => !!query.booleanMember                                                                                      |
| attribute_not_exists(_path_)                                                                                                                                | query => !query.member<br/>query => !!!query.booleanMember                                                                                      |
| begins_with(_path_, _substr_)                                                                                                                               | query => query.stringMember.startsWith("_substr_")                                                                                              |
| contains(#string_set_attr, :v_colors)<br/>attributeNames: {<br/>#string_set_attr: "COLORS"<br/>}<br/>attributeValues: {<br/>":v_colors": {"S": "Red"}<br/>} | query => !query.colorsSet.contains("Red")                                                                                                       |
| contains(#string_attr, :v_sub)<br/>attributeNames: {<br/>#string_attr: "NAME"<br/>}<br/>attributeValues: {<br/>":v_sub": {"S": "the"}<br/>}                 | query => query.stringMember.contains("the")                                                                                                     |
| size(_path_) = :v_num                                                                                                                                     | query => Checks the string length: ```query.stringMember.length === 10```<br/>Checks the string set size: ```query => query.colorsSet.length === 3``` |


#Update Expressions
| AWS DynamoDB Expression                                                                    | Arrow Function                                                                      |
|--------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| SET Price = Price - :p<br/>where {":p": {"N": "5"}}                                        | updater => updater.set(x => x.price = x.price - 5)                                  |
| SET Colors = list_append(Colors, :v_colors)<br/>where {":v_colors": {"L": [{"S": "Red"}]}} | updater => updater.set(x => x.colors = x.colors.concat('Red'))                      |
| SET Colors = list_append(:v_colors, Colors)<br/>where {":v_colors": {"L": [{"S": "Red"}]}} | updater => updater.set((x, ctx) => x.colors = ctx.additionalColors.concat(x.colors)) |
| ADD Colors :v_colors<br/>where {":v_colors": {"S": "Red"}}                                 | updater => updater.set(x => x.colors.push("Red")                                    |
| REMOVE Colors[0], Colors[1]                                                                | updater => updater.set(x => x.colors.splice(0, 1)                                   |
| DELETE Color :v_colors                                                                     | *IN PROGRESS*                                                                       |
