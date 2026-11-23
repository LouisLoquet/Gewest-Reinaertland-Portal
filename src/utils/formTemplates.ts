import { Form, FormField, REINAERTLAND_GROUPS } from '../types/form';

export type FormTemplateKey = 'ikaa' | 'cocktailquiz' | 'gewestweekend_titos' | 'gewestweekend_ketis' | 'gewestweekend_aspis' | 'custom';

export interface FormTemplateOption {
  key: FormTemplateKey;
  title: string;
  category: string;
  badge: string;
  description: string;
  icon: string;
  defaultPaymentAmount?: number;
}

export const FORM_TEMPLATES: FormTemplateOption[] = [
  {
    key: 'ikaa',
    title: 'IKAA',
    category: 'Evenement',
    badge: 'Standaard sjabloon',
    description: 'Inter-Kompagnie der Afdelings-Activiteiten. Prefillt automatisch gegevens van vorig werkjaar indien beschikbaar.',
    icon: 'diversity_3',
    defaultPaymentAmount: 5,
  },
  {
    key: 'cocktailquiz',
    title: 'Cocktailquiz',
    category: 'Quiz & Ploegen',
    badge: 'Ploeginschrijving',
    description: 'Inschrijvingsformulier per ploeg / ploegkapitein voor de gewestelijke cocktailquiz.',
    icon: 'local_bar',
    defaultPaymentAmount: 25,
  },
  {
    key: 'gewestweekend_titos',
    title: "Gewestweekend Tito's",
    category: 'Gewestweekend (150 man)',
    badge: "Tito's",
    description: "Inschrijfformulier voor Tito's en leiding op gewestweekend. Met medische fiche, dieetwensen en zwemtoestemming.",
    icon: 'camping',
    defaultPaymentAmount: 35,
  },
  {
    key: 'gewestweekend_ketis',
    title: "Gewestweekend Keti's",
    category: 'Gewestweekend (150 man)',
    badge: "Keti's",
    description: "Inschrijfformulier voor Keti's en leiding op gewestweekend. Met medische fiche, dieetwensen en zwemtoestemming.",
    icon: 'hiking',
    defaultPaymentAmount: 35,
  },
  {
    key: 'gewestweekend_aspis',
    title: "Gewestweekend Aspi's",
    category: 'Gewestweekend (150 man)',
    badge: "Aspi's",
    description: "Inschrijfformulier voor Aspi's en leiding op gewestweekend. Met medische fiche, dieetwensen en zwemtoestemming.",
    icon: 'forest',
    defaultPaymentAmount: 35,
  },
  {
    key: 'custom',
    title: 'Ander Formulier (Blanco)',
    category: 'Vrij ontwerp',
    badge: 'Aangepast',
    description: 'Start vanaf een leeg formulier met basisvragen voor vrije activiteiten, eetfestijnen of enquêtes.',
    icon: 'post_add',
  },
];

// Standaard opties voor Reinaertland groepen inclusief 'LEIDING'
export const REINAERTLAND_GROUPS_WITH_LEIDING = [
  ...REINAERTLAND_GROUPS,
  'LEIDING',
];

export function getDefaultTemplateFields(key: FormTemplateKey): FormField[] {
  const ts = Date.now();
  switch (key) {
    case 'ikaa':
      return [
        {
          id: `f_${ts}_1`,
          type: 'text',
          label: 'Voornaam en achternaam deelnemer',
          placeholder: 'bv. Sam De Smet',
          required: true,
        },
        {
          id: `f_${ts}_2`,
          type: 'select',
          label: 'Chirogroep / Afdeling',
          helpText: "Ben je leiding of begeleiding? Kies hier steeds 'LEIDING'.",
          required: true,
          options: [...REINAERTLAND_GROUPS_WITH_LEIDING],
        },
        {
          id: `f_${ts}_3`,
          type: 'select',
          label: 'Afdeling van het lid',
          required: true,
          options: ["Speelclub", "Rakwi's", "Tito's", "Keti's", "Aspi's", "LEIDING"],
        },
        {
          id: `f_${ts}_4`,
          type: 'email',
          label: 'E-mailadres',
          placeholder: 'bv. sam@voorbeeld.be',
          required: true,
        },
        {
          id: `f_${ts}_5`,
          type: 'text',
          label: 'GSM / Telefoonnummer',
          placeholder: 'bv. 0499 12 34 56',
          required: true,
        },
        {
          id: `f_${ts}_6`,
          type: 'textarea',
          label: 'Medische fiche / Allergieën of dieetwensen',
          placeholder: "bv. Vegetarisch, notenallergie, medicatie inname... of typ 'Geen'",
          required: false,
        },
        {
          id: `f_${ts}_7`,
          type: 'text',
          label: 'Noodnummer contactpersoon (Ouder / Voogd)',
          placeholder: 'bv. Mama: 0477 11 22 33',
          required: true,
        },
        {
          id: `f_${ts}_8`,
          type: 'textarea',
          label: 'Opmerkingen voor de organisatie',
          placeholder: 'Eventuele extra info voor gewest Reinaertland...',
          required: false,
        },
      ];

    case 'cocktailquiz':
      return [
        {
          id: `f_${ts}_1`,
          type: 'text',
          label: 'Ploegnaam',
          placeholder: 'bv. De Slimste Reinaerts',
          required: true,
        },
        {
          id: `f_${ts}_2`,
          type: 'text',
          label: 'Naam ploegkapitein',
          placeholder: 'bv. Laura Van Landeghem',
          required: true,
        },
        {
          id: `f_${ts}_3`,
          type: 'email',
          label: 'E-mailadres ploegkapitein',
          placeholder: 'bv. laura@voorbeeld.be',
          required: true,
        },
        {
          id: `f_${ts}_4`,
          type: 'text',
          label: 'GSM-nummer ploegkapitein',
          placeholder: 'bv. 0470 12 34 56',
          required: true,
        },
        {
          id: `f_${ts}_5`,
          type: 'select',
          label: 'Chirogroep of achtergrond ploeg',
          required: true,
          options: [
            ...REINAERTLAND_GROUPS,
            'Oud-leiding / Sympathisanten',
            'Gewestploeg Reinaertland',
            'LEIDING',
            'Andere / Gastploeg',
          ],
        },
        {
          id: `f_${ts}_6`,
          type: 'number',
          label: 'Aantal personen in de ploeg (max. 6)',
          placeholder: '4, 5 of 6',
          required: true,
        },
        {
          id: `f_${ts}_7`,
          type: 'textarea',
          label: 'Namen van de overige teamleden',
          placeholder: 'Voornaam en achternaam van alle teamleden...',
          required: false,
        },
        {
          id: `f_${ts}_8`,
          type: 'textarea',
          label: 'Opmerkingen of verzoekjes',
          placeholder: 'Vragen, voorkeur van tafel...',
          required: false,
        },
      ];

    case 'gewestweekend_titos':
    case 'gewestweekend_ketis':
    case 'gewestweekend_aspis': {
      const afdelingName =
        key === 'gewestweekend_titos'
          ? "Tito's"
          : key === 'gewestweekend_ketis'
          ? "Keti's"
          : "Aspi's";

      return [
        {
          id: `f_${ts}_1`,
          type: 'text',
          label: 'Voornaam en achternaam deelnemer',
          placeholder: 'bv. Thomas Verstraeten',
          required: true,
        },
        {
          id: `f_${ts}_2`,
          type: 'select',
          label: 'Chirogroep',
          helpText: "Ben je leiding / begeleiding? Kies hier steeds 'LEIDING'.",
          required: true,
          options: [...REINAERTLAND_GROUPS_WITH_LEIDING],
        },
        {
          id: `f_${ts}_3`,
          type: 'select',
          label: 'Inschrijven als',
          required: true,
          options: [afdelingName, 'LEIDING'],
        },
        {
          id: `f_${ts}_4`,
          type: 'email',
          label: 'E-mailadres (ouder / lid)',
          placeholder: 'bv. ouders@voorbeeld.be',
          required: true,
        },
        {
          id: `f_${ts}_5`,
          type: 'text',
          label: 'GSM / Telefoonnummer noodcontact',
          placeholder: 'bv. 0499 88 77 66 (Mama / Papa)',
          required: true,
        },
        {
          id: `f_${ts}_6`,
          type: 'date',
          label: 'Geboortedatum lid',
          required: true,
        },
        {
          id: `f_${ts}_7`,
          type: 'textarea',
          label: 'Allergieën, diëten of medische opmerkingen',
          placeholder: "bv. Notenallergie, vegetarisch, hooikoorts, medicatie inname... of typ 'Geen'",
          required: true,
        },
        {
          id: `f_${ts}_8`,
          type: 'radio',
          label: 'Mag deelnemer zwemmen?',
          required: true,
          options: [
            'Ja, beschikt over officieel zwembrevet (kan zelfstandig zwemmen)',
            'Ja, maar enkel in ondiep bad / pootjebaden',
            'Nee, mag niet in het water',
          ],
        },
        {
          id: `f_${ts}_9`,
          type: 'radio',
          label: "Toestemming voor foto's op reinaertland.be",
          required: true,
          options: [
            "Ja, sfeerfoto's mogen gepubliceerd worden",
            "Nee, liever geen herkenbare foto's online",
          ],
        },
        {
          id: `f_${ts}_10`,
          type: 'textarea',
          label: 'Extra opmerkingen voor de gewestleiding',
          placeholder: 'Dingen die de leiding moet weten (slaapgewoonten, heimwee, medicijnen)...',
          required: false,
        },
      ];
    }

    case 'custom':
    default:
      return [
        {
          id: `f_${ts}_1`,
          type: 'text',
          label: 'Voornaam en achternaam',
          placeholder: 'bv. Joris Van Damme',
          required: true,
        },
        {
          id: `f_${ts}_2`,
          type: 'email',
          label: 'E-mailadres',
          placeholder: 'bv. joris@voorbeeld.be',
          required: true,
        },
        {
          id: `f_${ts}_3`,
          type: 'select',
          label: 'Chirogroep',
          helpText: "Ben je leiding / begeleiding? Kies hier steeds 'LEIDING'.",
          required: true,
          options: [...REINAERTLAND_GROUPS_WITH_LEIDING],
        },
      ];
  }
}

export function buildTemplateFormState(
  templateKey: FormTemplateKey,
  targetWerkjaar: string,
  existingForms: Form[]
): {
  title: string;
  description: string;
  fields: FormField[];
  requirePayment: boolean;
  paymentAmount: string;
  paymentIban: string;
  paymentMessage: string;
  allowMultipleSubmissions: boolean;
  confirmationMessage: string;
  copiedFromPreviousYear: boolean;
  previousFormTitle?: string;
} {
  const safeTargetWerkjaar = targetWerkjaar && targetWerkjaar >= '2026-2027' ? targetWerkjaar : '2026-2027';

  // Als custom: blanco
  if (templateKey === 'custom') {
    return {
      title: `Formulier ${safeTargetWerkjaar}`,
      description: '',
      fields: getDefaultTemplateFields('custom'),
      requirePayment: false,
      paymentAmount: '',
      paymentIban: '',
      paymentMessage: '',
      allowMultipleSubmissions: false,
      confirmationMessage: 'Bedankt voor je inschrijving! We hebben je reactie goed ontvangen.',
      copiedFromPreviousYear: false,
    };
  }

  // Zoek naar formulier van vorig jaar voor dit evenement
  // Sleutelwoorden om te matchen
  const matchKeywords: Record<FormTemplateKey, string[]> = {
    ikaa: ['ikaa'],
    cocktailquiz: ['cocktailquiz', 'cocktail', 'quiz'],
    gewestweekend_titos: ['gewestweekend', 'tito'],
    gewestweekend_ketis: ['gewestweekend', 'keti'],
    gewestweekend_aspis: ['gewestweekend', 'aspi'],
    custom: [],
  };

  const keywords = matchKeywords[templateKey] || [];

  // Zoek oudste of vorig formulier dat overeenkomt (gesorteerd op id desc)
  const previousForm = existingForms.find(f => {
    const t = (f.title || '').toLowerCase();
    return keywords.every(kw => t.includes(kw));
  });

  if (previousForm && previousForm.fields && previousForm.fields.length > 0) {
    // Gegevens overnemen van formulier uit vorig jaar!
    let newTitle = previousForm.title;
    // Vervang eventueel oud werkjaar of jaartal in de titel door het nieuwe werkjaar
    if (/\d{4}-\d{4}/.test(newTitle)) {
      newTitle = newTitle.replace(/\d{4}-\d{4}/, safeTargetWerkjaar);
    } else if (/\d{4}/.test(newTitle)) {
      newTitle = newTitle.replace(/\d{4}/, safeTargetWerkjaar.split('-')[0]);
    } else {
      newTitle = `${newTitle} ${safeTargetWerkjaar}`;
    }

    let paymentMsg = previousForm.paymentMessage || '';
    if (/\d{4}-\d{4}/.test(paymentMsg)) {
      paymentMsg = paymentMsg.replace(/\d{4}-\d{4}/, safeTargetWerkjaar);
    }

    return {
      title: newTitle,
      description: previousForm.description || '',
      // Deep copy velden met nieuwe timestamp IDs
      fields: JSON.parse(JSON.stringify(previousForm.fields)),
      requirePayment: Boolean(previousForm.requirePayment),
      paymentAmount: previousForm.paymentAmount ? String(previousForm.paymentAmount) : '',
      paymentIban: previousForm.paymentIban || '',
      paymentMessage: paymentMsg,
      allowMultipleSubmissions: templateKey === 'cocktailquiz' ? true : false,
      confirmationMessage: previousForm.confirmationMessage || 'Bedankt voor je inschrijving! We hebben je gegevens goed ontvangen.',
      copiedFromPreviousYear: true,
      previousFormTitle: previousForm.title,
    };
  }

  // Geen vorig formulier gevonden -> Laad rijke standaard template
  let title = '';
  let description = '';
  let paymentAmount = '0';
  let paymentMessage = '';

  switch (templateKey) {
    case 'ikaa':
      title = `IKAA ${safeTargetWerkjaar}`;
      description = `Inschrijvingsformulier voor de jaarlijkse Inter-Kompagnie Activiteit van Gewest Reinaertland.`;
      paymentAmount = '5.00';
      paymentMessage = `IKAA ${safeTargetWerkjaar} + Naam deelnemer`;
      break;
    case 'cocktailquiz':
      title = `Cocktailquiz ${safeTargetWerkjaar}`;
      description = `Schrijf jouw ploeg in voor de gewestelijke Cocktailquiz! Max. 6 personen per ploeg. Inschrijvingsgeld bedraagt €25 per ploeg.`;
      paymentAmount = '25.00';
      paymentMessage = `Cocktailquiz + Ploegnaam`;
      break;
    case 'gewestweekend_titos':
      title = `Gewestweekend Tito's ${safeTargetWerkjaar}`;
      description = `Inschrijvingsformulier voor het Gewestweekend Reinaertland - Tito's! Ongeveer 150 deelnemers verwacht. Zorg dat alle noodcontacten en dieetwensen nauwkeurig zijn ingevuld.`;
      paymentAmount = '35.00';
      paymentMessage = `Gewestweekend Tito's + Naam lid`;
      break;
    case 'gewestweekend_ketis':
      title = `Gewestweekend Keti's ${safeTargetWerkjaar}`;
      description = `Inschrijvingsformulier voor het Gewestweekend Reinaertland - Keti's! Ongeveer 150 deelnemers verwacht. Zorg dat alle noodcontacten en dieetwensen nauwkeurig zijn ingevuld.`;
      paymentAmount = '35.00';
      paymentMessage = `Gewestweekend Keti's + Naam lid`;
      break;
    case 'gewestweekend_aspis':
      title = `Gewestweekend Aspi's ${safeTargetWerkjaar}`;
      description = `Inschrijvingsformulier voor het Gewestweekend Reinaertland - Aspi's! Ongeveer 150 deelnemers verwacht. Zorg dat alle noodcontacten en dieetwensen nauwkeurig zijn ingevuld.`;
      paymentAmount = '35.00';
      paymentMessage = `Gewestweekend Aspi's + Naam lid`;
      break;
  }

  return {
    title,
    description,
    fields: getDefaultTemplateFields(templateKey),
    requirePayment: Number(paymentAmount) > 0,
    paymentAmount: paymentAmount !== '0' ? paymentAmount : '',
    paymentIban: '',
    paymentMessage,
    allowMultipleSubmissions: templateKey === 'cocktailquiz' ? true : false,
    confirmationMessage: 'Bedankt voor je inschrijving! We hebben je gegevens goed ontvangen. Tot dan!',
    copiedFromPreviousYear: false,
  };
}
