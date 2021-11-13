import {DynamoService} from "../services/dynamoService";
import {ClockRecord, ClocksQuery} from "./models";
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

test("Must write clock record to DynamoDB", async () => {
    const mappingBuilder = new DynamoDBMappingBuilder();
    const mappingProfile = new TestMappingProfile();
    mappingProfile.register(mappingBuilder);
    const schemaProvider = mappingBuilder.buildSchemaProvider();
    const dynamoService = new DynamoService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
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
    const isSaved = await dynamoService.saveAsync(clockRecord);
});

test("Must query clock records from DynamoDB", async () => {
    const mappingBuilder = new DynamoDBMappingBuilder();
    const mappingProfile = new TestMappingProfile();
    mappingProfile.register(mappingBuilder);
    const schemaProvider = mappingBuilder.buildSchemaProvider();
    const dynamoService = new DynamoService(new AppDynamoDBClientResolver(), schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));
    const query = dynamoService
        .query(new ClocksQuery())
        .where(x => x.clockType === "Hybrid" && x.isCertified)
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
});
