export interface SetupShellOptions {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  panelId?: string;
}

export interface SetupSectionOptions {
  title: string;
  description?: string;
  role?: string;
}

export interface SetupShell {
  surface: HTMLDivElement;
  card: HTMLDivElement;
  header: HTMLDivElement;
  eyebrow?: HTMLParagraphElement;
  title: HTMLHeadingElement;
  subtitle?: HTMLParagraphElement;
  body: HTMLDivElement;
  actions: HTMLDivElement;
}

export interface SetupSection {
  section: HTMLElement;
  title: HTMLHeadingElement;
  description?: HTMLParagraphElement;
  content: HTMLDivElement;
}

function assignStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

export function createSetupShell(options: SetupShellOptions): SetupShell {
  const surface = document.createElement('div');
  if (options.panelId) {
    surface.id = options.panelId;
  }
  surface.dataset.role = 'setup-surface';
  assignStyles(surface, {
    position: 'absolute',
    inset: '0',
    background: 'linear-gradient(180deg, rgba(9,11,28,0.98), rgba(24,18,12,0.96))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: '50',
  });

  const card = document.createElement('div');
  card.dataset.role = 'setup-card';
  assignStyles(card, {
    width: 'min(100%, 920px)',
    maxHeight: '100%',
    overflowY: 'auto',
    border: '1px solid rgba(232,193,112,0.22)',
    borderRadius: '24px',
    background: 'rgba(17,20,38,0.92)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
    padding: '24px',
    color: '#f4f1e8',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    fontFamily: 'inherit',
  });
  surface.appendChild(card);

  const header = document.createElement('div');
  header.dataset.role = 'setup-panel-header';
  assignStyles(header, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  });
  card.appendChild(header);

  let eyebrow: HTMLParagraphElement | undefined;
  if (options.eyebrow) {
    eyebrow = document.createElement('p');
    eyebrow.dataset.role = 'setup-eyebrow';
    eyebrow.textContent = options.eyebrow;
    assignStyles(eyebrow, {
      margin: '0',
      color: '#e8c170',
      fontSize: '12px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
    });
    header.appendChild(eyebrow);
  }

  const title = document.createElement('h1');
  title.dataset.role = 'setup-title';
  title.textContent = options.title;
  assignStyles(title, {
    margin: '0',
    color: '#f7f1d7',
    fontSize: '28px',
    lineHeight: '1.15',
  });
  header.appendChild(title);

  let subtitle: HTMLParagraphElement | undefined;
  if (options.subtitle) {
    subtitle = document.createElement('p');
    subtitle.dataset.role = 'setup-subtitle';
    subtitle.textContent = options.subtitle;
    assignStyles(subtitle, {
      margin: '0',
      color: 'rgba(244,241,232,0.72)',
      fontSize: '14px',
      lineHeight: '1.5',
    });
    header.appendChild(subtitle);
  }

  const body = document.createElement('div');
  body.dataset.role = 'setup-body';
  assignStyles(body, {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  });
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.dataset.role = 'setup-actions';
  assignStyles(actions, {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  });
  card.appendChild(actions);

  return { surface, card, header, eyebrow, title, subtitle, body, actions };
}

export function createSetupSection(options: SetupSectionOptions): SetupSection {
  const section = document.createElement('section');
  if (options.role) {
    section.dataset.role = options.role;
  }
  assignStyles(section, {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '18px',
    background: 'rgba(255,255,255,0.04)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  });

  const title = document.createElement('h2');
  title.dataset.role = 'setup-section-title';
  title.textContent = options.title;
  assignStyles(title, {
    margin: '0',
    fontSize: '17px',
    color: '#f7f1d7',
  });
  section.appendChild(title);

  let description: HTMLParagraphElement | undefined;
  if (options.description) {
    description = document.createElement('p');
    description.dataset.role = 'setup-section-description';
    description.textContent = options.description;
    assignStyles(description, {
      margin: '0',
      fontSize: '13px',
      lineHeight: '1.5',
      color: 'rgba(244,241,232,0.68)',
    });
    section.appendChild(description);
  }

  const content = document.createElement('div');
  content.dataset.role = 'setup-section-content';
  assignStyles(content, {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  });
  section.appendChild(content);

  return { section, title, description, content };
}
