import {DatabaseService, DynamoDBService} from "../services/dynamoService";
import {ClockRecord, ClockRecordId, ClocksQuery} from "./models";
import {TestMappingProfile} from "./testMappingProfile";
import {config, DynamoDB, SharedIniFileCredentials} from "aws-sdk";
import {DynamoDBClientResolver} from "../services/dynamoResolver";
import {DefaultDynamoDBRecordMapper} from "../mappers/recordMapper";
import DynamoDBMappingBuilder from "../mappers/mappingBuilder";

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

test("Must write clock record to DynamoDB", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const clockRecord = new ClockRecord();
    clockRecord.clockType = "Hybrid";
    clockRecord.clockModel = "DW8F1";
    clockRecord.isCertified = true;
    clockRecord.brand = "Fossil";
    clockRecord.totalSegments = 60;
    clockRecord.clockDetails = {
        serialNumber: "UK7-DW8",
        madeIn: "CHN"
    };
    const isSaved = await dynamoService.put(clockRecord).executeAsync();
});

test("Must query clock records from DynamoDB", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const query = dynamoService
        .query(new ClocksQuery())
        .where(x => x.clockType === "Hybrid" && x.isCertified)
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
});

test("Must update clock record", async () => {
    const dynamoService = new DynamoDBService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const params = {end: 4, stores: ["Target", "Costco"]};
    const updated = await dynamoService.update(new ClockRecordId("DW8F1"))
        .when(x => !!x.totalSegments && x.totalSegments > 0 && !!x.eligibleInCountries && !x.eligibleInCountries.includes('USA') && !!x.availableInStores && !!x.clockDetails)
        .update((x, ctx) => x.availableInStores = x.availableInStores.concat(ctx.stores), params)
        .update((x, ctx) => x.eligibleInCountries = x.eligibleInCountries.concat("CAN", "USA"), params)
        .update((x, ctx) => x.availableInStores.splice(0, ctx.end), params)
        .update(x => x.totalSegments = x.totalSegments! / 2)
        .update(x => x.eligibleInCountries = x.eligibleInCountries.concat('USA'))
        .destroy(x => x.clockDetails)
        .executeAsync();
});
