/* Entirely fictional records for the SoftDV planning prototype. */
E.TABLE_SCHEMA = {
  Companies: { Name: 'Text', City: 'Text', Currency: 'Text', Founded: 'Date', PreMoney: 'Numeric', Cash: 'Numeric', MonthlyBurn: 'Numeric', PoolReserved: 'Numeric', Description: 'Text' },
  Stakeholders: { Company: 'Ref:Companies', Name: 'Text', Role: 'Text', Title: 'Text', Email: 'Text', Color: 'Text' },
  Holdings: { Company: 'Ref:Companies', Holder: 'Ref:Stakeholders', Shares: 'Numeric', ShareClass: 'Text', Issued: 'Date', Note: 'Text' },
  Grants: { Company: 'Ref:Companies', Holder: 'Ref:Stakeholders', Units: 'Numeric', Start: 'Date', CliffMonths: 'Int', DurationMonths: 'Int', ExercisePrice: 'Numeric', Status: 'Text' },
  Scenarios: { Company: 'Ref:Companies', Name: 'Text', PreMoney: 'Numeric', Investment: 'Numeric', PoolPercent: 'Numeric', Notes: 'Text', CreatedAt: 'DateTime:Asia/Vladivostok' },
  Milestones: { Company: 'Ref:Companies', Date: 'Date', Title: 'Text', Detail: 'Text', Kind: 'Text' }
};

E.demoData = {
  Companies: [{ id: 1, Name: 'SoftDV', City: 'Vladivostok', Currency: 'RUB', Founded: '2023-04-17', PreMoney: 180000000, Cash: 30000000, MonthlyBurn: 2500000, PoolReserved: 120000, Description: 'A fictional software studio building workflow tools for Pacific-region businesses. Synthetic data for planning and simulation only.' }],
  Stakeholders: [
    { id: 1, Company: 1, Name: 'Pavel Orlov', Role: 'Founder', Title: 'Co-founder & CEO', Email: 'pavel.orlov@example.com', Color: '#4b6fff' },
    { id: 2, Company: 1, Name: 'Alina Kim', Role: 'Founder', Title: 'Co-founder & CTO', Email: 'alina.kim@example.com', Color: '#62a69b' },
    { id: 3, Company: 1, Name: 'Pacific Angels', Role: 'Investor', Title: 'Angel syndicate', Email: 'pacific.angels@example.com', Color: '#bc9dd9' },
    { id: 4, Company: 1, Name: 'Daria Sokolova', Role: 'Employee', Title: 'Head of product', Email: 'daria.sokolova@example.com', Color: '#e3927f' },
    { id: 5, Company: 1, Name: 'Mikhail Lee', Role: 'Employee', Title: 'Lead engineer', Email: 'mikhail.lee@example.com', Color: '#7095bb' },
    { id: 6, Company: 1, Name: 'Sofia Volkova', Role: 'Employee', Title: 'Product designer', Email: 'sofia.volkova@example.com', Color: '#c9a868' },
    { id: 7, Company: 1, Name: 'Timur Petrov', Role: 'Employee', Title: 'Growth lead', Email: 'timur.petrov@example.com', Color: '#8d91a3' }
  ],
  Holdings: [
    { id: 1, Company: 1, Holder: 1, Shares: 480000, ShareClass: 'Ordinary', Issued: '2023-04-17', Note: 'Fictional founder allocation.' },
    { id: 2, Company: 1, Holder: 2, Shares: 320000, ShareClass: 'Ordinary', Issued: '2023-04-17', Note: 'Fictional founder allocation.' },
    { id: 3, Company: 1, Holder: 3, Shares: 200000, ShareClass: 'Ordinary', Issued: '2024-06-01', Note: 'Simplified angel investment; no preferences modeled.' }
  ],
  Grants: [
    { id: 1, Company: 1, Holder: 4, Units: 25000, Start: '2024-10-01', CliffMonths: 12, DurationMonths: 48, ExercisePrice: 10, Status: 'Active' },
    { id: 2, Company: 1, Holder: 5, Units: 25000, Start: '2025-01-15', CliffMonths: 12, DurationMonths: 48, ExercisePrice: 10, Status: 'Active' },
    { id: 3, Company: 1, Holder: 6, Units: 20000, Start: '2025-07-01', CliffMonths: 12, DurationMonths: 48, ExercisePrice: 15, Status: 'Active' },
    { id: 4, Company: 1, Holder: 7, Units: 10000, Start: '2026-03-31', CliffMonths: 12, DurationMonths: 48, ExercisePrice: 20, Status: 'Active' }
  ],
  Scenarios: [
    { id: 1, Company: 1, Name: 'Focused seed', PreMoney: 180000000, Investment: 45000000, PoolPercent: 12, Notes: 'Synthetic planning case: build the core product and extend runway.', CreatedAt: '2026-09-20T02:00:00.000Z' },
    { id: 2, Company: 1, Name: 'Growth round', PreMoney: 240000000, Investment: 80000000, PoolPercent: 15, Notes: 'Synthetic planning case: fund a larger product and commercial team.', CreatedAt: '2026-09-21T02:00:00.000Z' }
  ],
  Milestones: [
    { id: 1, Company: 1, Date: '2023-04-17', Title: 'SoftDV founded', Detail: 'Pavel and Alina begin building workflow software.', Kind: 'Company' },
    { id: 2, Company: 1, Date: '2024-06-01', Title: 'Angel round', Detail: 'Pacific Angels joins the fictional ownership baseline.', Kind: 'Funding' },
    { id: 3, Company: 1, Date: '2025-09-01', Title: 'First enterprise pilot', Detail: 'A fictional customer validates the product direction.', Kind: 'Product' },
    { id: 4, Company: 1, Date: '2026-12-01', Title: 'Next financing decision', Detail: 'Compare planning scenarios before deciding how much to raise.', Kind: 'Planning' }
  ]
};
