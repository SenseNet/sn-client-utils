export const filterAsync = async <T>(values: Iterable<T>, callbackFn: (entry: T) => Promise<boolean>) => {
    const returns = [];
    for (const value of values) {
        (await callbackFn(value)) && returns.push(value);
    }
    return returns;
};

declare global {
    // tslint:disable-next-line:interface-name
    export interface Array<T> {
        filterAsync: (callbackFn: (entry: T) => Promise<boolean>) => T[];
    }
}
(Array.prototype as any).filterAsync = function(callbackFn: (entry: any) => Promise<boolean>) {
    return filterAsync(this, callbackFn);
};
