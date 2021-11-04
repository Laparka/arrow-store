export type TokenType = 'GroupStart' | 'GroupEnd' | 'LambdaInitializer'
    | 'Object' | 'Inverse'
    | 'String' | 'FormatString' | 'Number' | 'Boolean'
    | 'Or' | 'And'
    | 'LessThan' | 'LessThanOrEquals' | 'GreaterThan' | 'GreaterOrEquals' | 'Equals' | 'NotEquals'
    | 'Terminator';
export type QueryToken = {
    tokenType: TokenType;
    index: number;
    length: number;
}
