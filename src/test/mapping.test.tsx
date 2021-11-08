import {MappingBuilder} from "../mappers/schemaBuilders";
import DynamoDBMappingBuilder from "../mappers/mappingBuilder";
import TestMappingProfile from "./testMappingProfile";

test("Must build mapping schema provider", () => {
    const schemaBuilder: MappingBuilder = new DynamoDBMappingBuilder();
    const profile = new TestMappingProfile();
    profile.register(schemaBuilder);
    const provider = schemaBuilder.buildMappingProvider();
});
