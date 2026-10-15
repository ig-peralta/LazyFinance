import { Component } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';

@Component({
  selector: 'landing-page',
  imports: [ButtonDirective, Card, Tag],
  templateUrl: './landing.page.html',
})
export class LandingPage {}
