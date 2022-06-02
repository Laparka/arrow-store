import {DatabaseService, DynamoDBService} from "../services/dynamoService";
import {ClockRecord, ClockRecordId, ClocksQuery} from "./models";
import {ClockRecordMappingProfile} from "./clockRecordMappingProfile";
import {config, DynamoDB, SharedIniFileCredentials} from "aws-sdk";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {DefaultDynamoDBRecordMapper} from "../mappers/recordMapper";
import DynamoDBMappingBuilder from "../mappers/mappingBuilder";
import assert from "assert";
import {GetRecordInBatchRequest} from "../records/record";

class AppDynamoDBClientResolver implements DynamoDBClientResolver {
    resolve(): DynamoDB {
        config.update({region: 'us-west-2'});
        const credentials = new SharedIniFileCredentials({profile: 'arrow-store-integration'});
        config.credentials = credentials;
        const client = new DynamoDB();
        return client;
    }
}

const mappingBuilder = new DynamoDBMappingBuilder();
const mappingProfile = new ClockRecordMappingProfile();
mappingProfile.register(mappingBuilder);
const schemaProvider = mappingBuilder.buildSchemaProvider();

test("Must batch write items", async () => {
    const dynamoService: DatabaseService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const clockRecord = new ClockRecord();
    clockRecord.clockType = "Digital";
    clockRecord.clockModel = "Analo govnet";
    clockRecord.isCertified = false;
    clockRecord.brand = "Kasio";
    clockRecord.totalSegments = 0;
    clockRecord.eligibleInCountries = ["CHN", "RUS"];
    clockRecord.availableInStores = ["AliExpress", "Eldorado"]
    clockRecord.clockDetails = {
        serialNumber: "ORC123",
        madeIn: "CHN"
    };

    await dynamoService
        .batchWriteAsync(query => {
            query.put(clockRecord)
                .delete(new ClockRecordId("A909"));
        });
});

test("Must transact write items", async () => {
    const clockRecord = new ClockRecord();
    clockRecord.clockType = "Hybrid";
    clockRecord.clockModel = "TRANSACT_WRITE";
    clockRecord.isCertified = false;
    clockRecord.brand = "Fossil";
    clockRecord.totalSegments = 60;
    clockRecord.eligibleInCountries = ["USA", "CAN"];
    clockRecord.availableInStores = ["Amazon", "BestBuy"]
    clockRecord.clockDetails = {
        serialNumber: "UK7-DW8",
        madeIn: "CHN"
    };

    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    await dynamoService
        .transactWriteItems("idk")
        .when(new ClockRecordId("DW"), x => x.clockType === "Digital")
        .delete(new ClockRecordId("ORC123"), remove => remove.when(x => !!x.clockType))
        .put(clockRecord, put => put.when(x => !!x.clockType))
        .update(new ClockRecordId("UNKNOWN"), updater => updater
            .set(x => x.clockType = "Analog")
            .destroy(x => x.isCertified)
            .when(x => x.clockType === "Digital")
        )
        .executeAsync();
});

test("Must put a clock record to DynamoDB", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const clockRecord = new ClockRecord();
    clockRecord.clockType = "Hybrid";
    clockRecord.clockModel = "DW8F1";
    clockRecord.isCertified = true;
    clockRecord.brand = "Fossil";
    clockRecord.totalSegments = 60;
    clockRecord.eligibleInCountries = ["USA", "CAN"];
    clockRecord.availableInStores = ["Amazon", "BestBuy"]
    clockRecord.clockDetails = {
        serialNumber: "UK7-DW8",
        madeIn: "CHN"
    };
    const fiftyNiner = (new Date()).getSeconds() % 59;
    const ctx = {
        segments: fiftyNiner
    }
    const isSaved = await dynamoService
        .put(clockRecord)
        .when(x => !!!x.totalSegments || x.totalSegments > 0)
        .executeAsync();
});

test("Must get a clock record", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const record = await dynamoService.getAsync(new ClockRecordId("DW8F1"));
    assert(record);
});

test("Must get batch items", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const getRequests: GetRecordInBatchRequest[] = [
        {
            recordId: new ClockRecordId("DW8F1")
        }
    ];
    const records = await dynamoService.batchGetAsync(getRequests);
    assert(records.length !== 0);
    assert(records[0] === getRequests[0].record);
    assert(getRequests[0].record['clockModel'] == "DW8F1")
});

test("Must query clock records from DynamoDB", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {
        store: 'Amazon'
    };
    const query = dynamoService
        .query(new ClocksQuery())
        .where((x, ctx) => x.clockType === "Hybrid", params)
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
    assert(!!clockRecords);
    assert(clockRecords.records);
});

test("Must build a complex query", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {
        store: 'Amazon'
    };
    const query = dynamoService
        .query(new ClocksQuery())
        .where((x, ctx) => x.isCertified || x.eligibleInCountries.includes("USA") || x.availableInStores.length > 0 && x.clockType === "Hybrid" && (x.isCertified || x.availableInStores.includes(ctx.store)) || !x.clockDetails || !!x.clockDetails && x.clockDetails.serialNumber.startsWith("US"), params)
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
    assert(!!clockRecords);
});

test("Must build a simple query", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const query = dynamoService
        .query(new ClocksQuery())
        .where(x => !x.isCertified)
        .take(10)
        .sortByAscending();
    const clockRecords = await query.listAsync()
});

test("Must update clock record", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {end: 4, stores: ["Target", "Costco"], countries: ["ITL"], country: "CHN"};
    const updated = await dynamoService.update(new ClockRecordId("DW8F1"))
        .when(x => !!x.totalSegments)
        .set(x => x.totalSegments! += 5)
        .set((x, ctx) => x.eligibleInCountries.push(...ctx.countries), params)
        .setWhenNotExists(x => x.totalSegments, x => x.isCertified = true)
        .destroy(x => x.clockDetails)
        .executeAsync();
});

test("Must delete a clock record", async() => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const removed = await dynamoService
        .delete(new ClockRecordId("DW8F1"))
        .when(x => !!x.isCertified)
        .executeAsync();
});
