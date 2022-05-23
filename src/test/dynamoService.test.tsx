import {DynamoDBService} from "../services/dynamoService";
import {ClockRecord, ClockRecordId, ClocksQuery} from "./models";
import {TestMappingProfile} from "./testMappingProfile";
import {config, DynamoDB, SharedIniFileCredentials} from "aws-sdk";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {DefaultDynamoDBRecordMapper} from "../mappers/recordMapper";
import DynamoDBMappingBuilder from "../mappers/mappingBuilder";
import assert from "assert";

class AppDynamoDBClientResolver implements DynamoDBClientResolver {
    resolve(): DynamoDB {
        config.update({region: 'us-west-2'});
        const credentials = new SharedIniFileCredentials({profile: 'kostyl-integration'});
        config.credentials = credentials;
        const client = new DynamoDB();
        return client;
    }
}

const mappingBuilder = new DynamoDBMappingBuilder();
const mappingProfile = new TestMappingProfile();
mappingProfile.register(mappingBuilder);
const schemaProvider = mappingBuilder.buildSchemaProvider();

test("Must get a clock record", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const record = await dynamoService.getAsync(new ClockRecordId("DW8F1"));
    assert(!!record);
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
        .when(x => !!!x.totalSegments)
        .executeAsync();
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
        .update(x => x.totalSegments! += 5)
        .update((x, ctx) => x.eligibleInCountries.push(...ctx.countries), params)
        .updateWhenNotExists(x => x.totalSegments, x => x.isCertified = true)
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
