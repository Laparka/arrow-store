import {DynamoDBRecord} from "../records/record";

export type DeleteBuilder<TRecord extends DynamoDBRecord> = {
    where<TContext>(predicate: (record: TRecord, context: TContext) => boolean, parametersMap?: TContext): DeleteBuilder<TRecord>,
    executeAsync(): Promise<boolean>
};
