import { expect } from "chai";
import { using, usingAsync } from "../src";
import { MockDisposable } from "./MockDisposable";

/**
 * Unit tests for disposables
 */
export const disposableTests = describe("Disposable", () => {
    it("Can be constructed", () => {
        using(new MockDisposable(), (d) => {
            expect(d).to.be.instanceof(MockDisposable);
        });
    });

    describe("isDisposed", () => {
        it("should return a correct value before and after disposition", () => {
            const d = new MockDisposable();
            expect(d.isDisposed()).to.be.eq(false);
            d.dispose();
            expect(d.isDisposed()).to.be.eq(true);
        });
    });

    describe("dispose()", () => {
        it("should be called on error", (done: MochaDone) => {
            try {
                using(new MockDisposable(), (d) => {
                    d.disposeCallback = () => { done(); };

                    d.whooops();
                });
            } catch {
                /** ignore */
            }
        });

        it("should be called with usingAsync()", (done: MochaDone) => {
            usingAsync(new MockDisposable(), async (d) => {
                d.disposeCallback = () => {
                    done();
                };
                return new Promise((resolve, reject) => {
                    setTimeout(resolve, 1);
                });
            });
        });

        it("should be called when async fails", (done: MochaDone) => {
            usingAsync(new MockDisposable(), async (d) => {
                d.disposeCallback = () => {
                    done();
                };
                return new Promise((resolve, reject) => {
                    setTimeout(reject, 1);
                });
            }).catch((err) => {
                /** ignore */
            });
        });
    });

});
