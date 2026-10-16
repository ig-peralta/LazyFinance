import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { SessionService } from '../../services/session/session.service';

@Component({
  selector: 'landing-page',
  imports: [ButtonDirective, Card, Tag, RouterLink],
  templateUrl: './landing.page.html',
})
export class LandingPage {
  protected readonly session = inject(SessionService);
}
