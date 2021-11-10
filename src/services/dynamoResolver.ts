import {DynamoDB} from "aws-sdk";

export interface DynamoDBClientResolver {
    resolve(): DynamoDB;
}
