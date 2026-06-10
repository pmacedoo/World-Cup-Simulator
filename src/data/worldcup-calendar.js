
// Calendario base da Copa 2026, separado da engine para facilitar ajustes.
// Horarios no fuso usado pela tabela colada no projeto.
export const WC_CALENDAR = (() => {
  const groupRows = [
    ["2026-06-11","11 de junho","16h","México","África do Sul","A"],
    ["2026-06-11","11 de junho","23h","Coreia do Sul","Tchéquia","A"],
    ["2026-06-12","12 de junho","16h","Canadá","Bósnia e Herzegovina","B"],
    ["2026-06-12","12 de junho","22h","Estados Unidos","Paraguai","D"],
    ["2026-06-13","13 de junho","16h","Catar","Suíça","B"],
    ["2026-06-13","13 de junho","19h","Brasil","Marrocos","C"],
    ["2026-06-13","13 de junho","22h","Haiti","Escócia","C"],
    ["2026-06-14","14 de junho","01h","Austrália","Turquia","D"],
    ["2026-06-14","14 de junho","14h","Alemanha","Curaçao","E"],
    ["2026-06-14","14 de junho","17h","Holanda","Japão","F"],
    ["2026-06-14","14 de junho","20h","Costa do Marfim","Equador","E"],
    ["2026-06-14","14 de junho","23h","Suécia","Tunísia","F"],
    ["2026-06-15","15 de junho","13h","Espanha","Cabo Verde","H"],
    ["2026-06-15","15 de junho","16h","Bélgica","Egito","G"],
    ["2026-06-15","15 de junho","19h","Arábia Saudita","Uruguai","H"],
    ["2026-06-15","15 de junho","22h","Irã","Nova Zelândia","G"],
    ["2026-06-16","16 de junho","16h","França","Senegal","I"],
    ["2026-06-16","16 de junho","19h","Iraque","Noruega","I"],
    ["2026-06-16","16 de junho","22h","Argentina","Argélia","J"],
    ["2026-06-17","17 de junho","01h","Áustria","Jordânia","J"],
    ["2026-06-17","17 de junho","14h","Portugal","RD Congo","K"],
    ["2026-06-17","17 de junho","17h","Inglaterra","Croácia","L"],
    ["2026-06-17","17 de junho","20h","Gana","Panamá","L"],
    ["2026-06-17","17 de junho","23h","Uzbequistão","Colômbia","K"],
    ["2026-06-18","18 de junho","13h","Tchéquia","África do Sul","A"],
    ["2026-06-18","18 de junho","16h","Suíça","Bósnia e Herzegovina","B"],
    ["2026-06-18","18 de junho","19h","Canadá","Catar","B"],
    ["2026-06-18","18 de junho","22h","México","Coreia do Sul","A"],
    ["2026-06-19","19 de junho","16h","Estados Unidos","Austrália","D"],
    ["2026-06-19","19 de junho","19h","Escócia","Marrocos","C"],
    ["2026-06-19","19 de junho","21h30","Brasil","Haiti","C"],
    ["2026-06-20","20 de junho","01h","Turquia","Paraguai","D"],
    ["2026-06-20","20 de junho","14h","Holanda","Suécia","F"],
    ["2026-06-20","20 de junho","17h","Alemanha","Costa do Marfim","E"],
    ["2026-06-20","20 de junho","21h","Equador","Curaçao","E"],
    ["2026-06-21","21 de junho","01h","Tunísia","Japão","F"],
    ["2026-06-21","21 de junho","13h","Espanha","Arábia Saudita","H"],
    ["2026-06-21","21 de junho","16h","Bélgica","Irã","G"],
    ["2026-06-21","21 de junho","19h","Uruguai","Cabo Verde","H"],
    ["2026-06-21","21 de junho","22h","Nova Zelândia","Egito","G"],
    ["2026-06-22","22 de junho","14h","Argentina","Áustria","J"],
    ["2026-06-22","22 de junho","18h","França","Iraque","I"],
    ["2026-06-22","22 de junho","21h","Noruega","Senegal","I"],
    ["2026-06-23","23 de junho","00h","Jordânia","Argélia","J"],
    ["2026-06-23","23 de junho","14h","Portugal","Uzbequistão","K"],
    ["2026-06-23","23 de junho","17h","Inglaterra","Gana","L"],
    ["2026-06-23","23 de junho","20h","Panamá","Croácia","L"],
    ["2026-06-23","23 de junho","23h","Colômbia","RD Congo","K"],
    ["2026-06-24","24 de junho","16h","Suíça","Canadá","B"],
    ["2026-06-24","24 de junho","16h","Bósnia e Herzegovina","Catar","B"],
    ["2026-06-24","24 de junho","19h","Marrocos","Haiti","C"],
    ["2026-06-24","24 de junho","19h","Escócia","Brasil","C"],
    ["2026-06-24","24 de junho","22h","África do Sul","Coreia do Sul","A"],
    ["2026-06-24","24 de junho","22h","Tchéquia","México","A"],
    ["2026-06-25","25 de junho","17h","Equador","Alemanha","E"],
    ["2026-06-25","25 de junho","17h","Curaçao","Costa do Marfim","E"],
    ["2026-06-25","25 de junho","20h","Tunísia","Holanda","F"],
    ["2026-06-25","25 de junho","20h","Japão","Suécia","F"],
    ["2026-06-25","25 de junho","23h","Turquia","Estados Unidos","D"],
    ["2026-06-25","25 de junho","23h","Paraguai","Austrália","D"],
    ["2026-06-26","26 de junho","16h","Senegal","Iraque","I"],
    ["2026-06-26","26 de junho","16h","Noruega","França","I"],
    ["2026-06-26","26 de junho","21h","Cabo Verde","Arábia Saudita","H"],
    ["2026-06-26","26 de junho","21h","Uruguai","Espanha","H"],
    ["2026-06-27","27 de junho","00h","Egito","Irã","G"],
    ["2026-06-27","27 de junho","00h","Nova Zelândia","Bélgica","G"],
    ["2026-06-27","27 de junho","18h","Croácia","Gana","L"],
    ["2026-06-27","27 de junho","18h","Panamá","Inglaterra","L"],
    ["2026-06-27","27 de junho","20h30","RD Congo","Uzbequistão","K"],
    ["2026-06-27","27 de junho","20h30","Colômbia","Portugal","K"],
    ["2026-06-27","27 de junho","23h","Jordânia","Argentina","J"],
    ["2026-06-27","27 de junho","23h","Argélia","Áustria","J"],
  ];

  const knockoutRows = {
    73:["2026-06-28","28 de junho","16h"], 74:["2026-06-29","29 de junho","17h30"],
    75:["2026-06-29","29 de junho","22h"], 76:["2026-06-29","29 de junho","14h"],
    77:["2026-06-30","30 de junho","18h"], 78:["2026-06-30","30 de junho","14h"],
    79:["2026-06-30","30 de junho","22h"], 80:["2026-07-01","1 de julho","13h"],
    81:["2026-07-01","1 de julho","21h"], 82:["2026-07-01","1 de julho","17h"],
    83:["2026-07-02","2 de julho","20h"], 84:["2026-07-02","2 de julho","16h"],
    85:["2026-07-03","3 de julho","00h"], 86:["2026-07-03","3 de julho","19h"],
    87:["2026-07-03","3 de julho","22h30"], 88:["2026-07-03","3 de julho","15h"],
    89:["2026-07-04","4 de julho","18h"], 90:["2026-07-04","4 de julho","14h"],
    91:["2026-07-05","5 de julho","17h"], 92:["2026-07-05","5 de julho","21h"],
    93:["2026-07-06","6 de julho","16h"], 94:["2026-07-06","6 de julho","21h"],
    95:["2026-07-07","7 de julho","13h"], 96:["2026-07-07","7 de julho","17h"],
    97:["2026-07-09","9 de julho","17h"], 98:["2026-07-10","10 de julho","16h"],
    99:["2026-07-11","11 de julho","18h"], 100:["2026-07-11","11 de julho","22h"],
    101:["2026-07-14","14 de julho","16h"], 102:["2026-07-15","15 de julho","16h"],
    103:["2026-07-18","18 de julho","18h"], 104:["2026-07-19","19 de julho","16h"],
  };

  const groupByKey = {};
  const groupByLetter = {};
  const groupMatches = groupRows.map((row, index)=>{
    const [dateISO,dateLabel,time,home,away,group] = row;
    const matchNo = index + 1;
    const round = matchNo <= 24 ? 1 : matchNo <= 48 ? 2 : 3;
    const item = {matchNo, dateISO, dateLabel, time, home, away, group, round};
    groupByKey[[group, home, away].join("|")] = item;
    groupByKey[[group, away, home].join("|")] = item;
    groupByLetter[group] = groupByLetter[group] || [];
    groupByLetter[group].push(item);
    return item;
  });

  const knockoutByMatchNo = Object.fromEntries(Object.entries(knockoutRows).map(([matchNo,row])=>[
    Number(matchNo),
    {matchNo:Number(matchNo), dateISO:row[0], dateLabel:row[1], time:row[2]},
  ]));

  return {
    groupMatches,
    groupByLetter,
    groupByKey,
    knockoutByMatchNo,
    apply(match, entry){
      if(!entry) return match;
      match.matchNo = entry.matchNo ?? match.matchNo;
      match.dateISO = entry.dateISO;
      match.dateLabel = entry.dateLabel;
      match.time = entry.time;
      match.kickoff = `${entry.dateLabel} - ${entry.time}`;
      if(entry.round) match.round = entry.round;
      return match;
    },
    groupFixture(group, home, away){
      return groupByKey[[group, home, away].join("|")] || null;
    },
    knockoutFixture(matchNo){
      return knockoutByMatchNo[matchNo] || null;
    },
  };
})();
