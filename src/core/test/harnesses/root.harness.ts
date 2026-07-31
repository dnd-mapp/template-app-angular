import { ComponentHarness } from '@angular/cdk/testing';

export class RootHarness extends ComponentHarness {
    public static readonly hostSelector = 'app-root';

    private readonly paragraphLocator = this.locatorFor('p');

    public async paragraphContents() {
        return await (await this.paragraphLocator()).text();
    }
}
