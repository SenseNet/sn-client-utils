import { expect } from "chai";
import { Trace, using } from "../src";
import { ITraceMethodError, ITraceMethodFinished } from "../src/Trace";

// tslint:disable:completed-docs

class MockClass {

    /**
     *
     */
    constructor(private testValue?: string) {

    }

    public testError(msg: string) {
        throw Error(msg);
    }

    public testScope() {
        return this.testValue;
    }

    public static addStatic(...args: number[]) {
        return args.reduce((a, b) => a + b, 0);
    }

    public addInstance(...args: number[]) {
        return args.reduce((a, b) => a + b, 0);
    }

    public async addInstanceAsync(...args: number[]): Promise<number> {
        return args.reduce((a, b) => a + b, 0);
    }

}

export const traceTests = describe("Trace tests", () => {
    describe("Static method traces", () => {
        it("Static Methods call should be traced with args", (done: MochaDone) => {
            const args = [1, 2, 3];
            const observer = Trace.method(MockClass, MockClass.addStatic, (traceData) => {
                expect(args).to.be.deep.eq(traceData.arguments);
                if ((traceData as ITraceMethodFinished).returned) {
                    expect((traceData as ITraceMethodFinished).returned).to.be.eq(1 + 2 + 3);
                    observer.dispose();
                    done();
                }
            });
            MockClass.addStatic(...args);
        });

        it("shouldn't be triggered after observer is disposed", (done: MochaDone) => {
            const args = [1, 2, 3];
            const observer = Trace.method(MockClass, MockClass.addStatic, (traceData) => {
                done("Shouldn't be triggered here");
            });
            const observer2 = Trace.method(MockClass, MockClass.addStatic, (traceData) => {
                observer2.dispose();
                done();
            });
            observer.dispose();
            const returned = MockClass.addStatic(...args);
            expect(returned).to.be.eq(1 + 2 + 3);
        });
    });

    describe("Instance method traces", () => {
        it("should be traced with arguments", (done: MochaDone) => {
            const instance = new MockClass();
            const args = [1, 2, 3];
            const observer = Trace.method(instance, instance.addInstance, (traceData) => {
                expect(args).to.be.deep.eq(traceData.arguments);
                if ((traceData as ITraceMethodFinished).returned) {
                    expect((traceData as ITraceMethodFinished).returned).to.be.eq(1 + 2 + 3);
                    observer.dispose();
                    done();
                }
            });
            instance.addInstance(...args);
        });

        it("should be traced asynchronously", (done: MochaDone) => {
            const instance = new MockClass();
            const args = [1, 2, 3];
            const observer = Trace.method(instance, instance.addInstanceAsync, async (traceData) => {
                expect(args).to.be.deep.eq(traceData.arguments);
                if ((traceData as ITraceMethodFinished).returned) {
                    const returned = await (traceData as ITraceMethodFinished).returned;
                    expect(returned).to.be.eq(1 + 2 + 3);
                    observer.dispose();
                    done();
                }
            });
            instance.addInstanceAsync(...args);
        });

        it("should have a valid 'this' scope", (done: MochaDone) => {
            const instance = new MockClass("testValue");
            const observer = Trace.method(instance, instance.testScope, (traceData) => {
                if ((traceData as ITraceMethodFinished).returned) {
                    expect((traceData as ITraceMethodFinished).returned).to.be.eq("testValue");
                    observer.dispose();
                    done();
                }
            });
            expect(instance.testScope()).to.be.eq("testValue");
        });

        it("should handle throwing errors", (done: MochaDone) => {
            const instance = new MockClass("testValue");
            const observer = Trace.method(instance, instance.testError, (traceData) => {
                if ((traceData as ITraceMethodError).error) {
                    expect((traceData as ITraceMethodError).error.message).to.be.eq("message");
                    observer.dispose();
                    done();
                }
            });
            expect(() => {instance.testError("message"); }).to.throw();
        });
    });

});