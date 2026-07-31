import { appConfig, RootComponent } from '@/core';
import { bootstrapApplication } from '@angular/platform-browser';

bootstrapApplication(RootComponent, appConfig).catch((err) => console.error(err));
