import {
    DefaultDynamoDBClient,
    DefaultDynamoDBRecordMapper,
    DynamoDBClientResolver,
    DynamoDBMappingBuilder
} from "arrow-store";
import {DynamoDB} from "aws-sdk";
import {AppMappingProfile} from "./records/appMappingProfile";

const resolver: DynamoDBClientResolver = {
    resolve(): DynamoDB {
        return new DynamoDB();
    }
}

const mappingBuilder = new DynamoDBMappingBuilder();
const mappingProfile = new AppMappingProfile();
mappingProfile.register(mappingBuilder);
const schemaProvider = mappingBuilder.buildSchemaProvider();
export const DynamoDBClient = new DefaultDynamoDBClient(resolver, schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));