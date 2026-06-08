// ⚠️ ARQUIVO DE REFERÊNCIA — NÃO CARREGADO PELO SITE.
// Protótipo inicial do simulador (dados fictícios). O motor ativo usa
// worldcup-data.js. Mantido apenas para consulta histórica.

/* =================================================================
   BLOCO LEGADO INATIVO
   -----------------------------------------------------------------
   Mantido apenas como referência do protótipo anterior. O motor ativo
   usa os dados oficiais/derivados carregados de worldcup-data.js.
   -----------------------------------------------------------------
   ================================================================= */
const LEGACY_TEAMS = {
 "França":{ovr:91,conf:"UEFA",flag:"🇫🇷",coach:"Didier Deschamps",sq:[
   ["Kylian Mbappé","FW",12,"S"],["Ousmane Dembélé","FW",7],["Bradley Barcola","FW",6],["Marcus Thuram","FW",6],
   ["Michael Olise","MF",6],["Antoine Griezmann","MF",5],["Aurélien Tchouaméni","MF",2],["Eduardo Camavinga","MF",2],
   ["William Saliba","DF",1],["Dayot Upamecano","DF",1],["Theo Hernández","DF",1.5],["Mike Maignan","GK",0,"G"]]},
 "Espanha":{ovr:91,conf:"UEFA",flag:"🇪🇸",coach:"Luis de la Fuente",sq:[
   ["Lamine Yamal","FW",9,"SY"],["Nico Williams","FW",7],["Mikel Oyarzabal","FW",6],["Ferran Torres","FW",5],
   ["Dani Olmo","MF",6],["Pedri","MF",4],["Gavi","MF",3],["Mikel Merino","MF",3],["Rodri","MF",3],
   ["Pau Cubarsí","DF",1,"Y"],["Dani Carvajal","DF",1.5],["Unai Simón","GK",0,"G"]]},
 "Argentina":{ovr:90,conf:"CONMEBOL",flag:"🇦🇷",coach:"Lionel Scaloni",sq:[
   ["Lionel Messi","FW",10,"S"],["Lautaro Martínez","FW",9],["Julián Álvarez","FW",9],["Nico Paz","MF",6,"Y"],
   ["Alexis Mac Allister","MF",4],["Enzo Fernández","MF",4],["Rodrigo De Paul","MF",2],
   ["Nahuel Molina","DF",1.5],["Cristian Romero","DF",1],["Nicolás Otamendi","DF",1],["Emiliano Martínez","GK",0,"G"]]},
 "Brasil":{ovr:89,conf:"CONMEBOL",flag:"🇧🇷",coach:"Carlo Ancelotti",sq:[
   ["Vinícius Jr.","FW",10,"S"],["Raphinha","FW",8],["Rodrygo","FW",7],["Estêvão","FW",7,"Y"],["Endrick","FW",7,"Y"],
   ["Lucas Paquetá","MF",4],["Bruno Guimarães","MF",3],["Gerson","MF",2],
   ["Marquinhos","DF",1],["Gabriel Magalhães","DF",1],["Wesley","DF",1.5],["Alisson","GK",0,"G"]]},
 "Inglaterra":{ovr:89,conf:"UEFA",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",coach:"Thomas Tuchel",sq:[
   ["Harry Kane","FW",11,"S"],["Bukayo Saka","FW",8],["Anthony Gordon","FW",5],["Cole Palmer","MF",7],
   ["Jude Bellingham","MF",8],["Phil Foden","MF",6],["Declan Rice","MF",3],
   ["John Stones","DF",1],["Marc Guéhi","DF",1],["Trent Alexander-Arnold","DF",2],["Jordan Pickford","GK",0,"G"]]},
 "Portugal":{ovr:88,conf:"UEFA",flag:"🇵🇹",coach:"Roberto Martínez",sq:[
   ["Cristiano Ronaldo","FW",9,"S"],["Rafael Leão","FW",8],["Pedro Neto","FW",5],["João Félix","FW",4],
   ["Bruno Fernandes","MF",7],["Bernardo Silva","MF",6],["Vitinha","MF",3],["Rúben Neves","MF",2],
   ["Rúben Dias","DF",1],["João Cancelo","DF",1.5],["Nuno Mendes","DF",1.5],["Diogo Costa","GK",0,"G"]]},
 "Alemanha":{ovr:86,conf:"UEFA",flag:"🇩🇪",coach:"Julian Nagelsmann",sq:[
   ["Florian Wirtz","MF",8,"Y"],["Jamal Musiala","MF",8,"Y"],["Kai Havertz","FW",7],["Serge Gnabry","FW",5],
   ["Leroy Sané","FW",5],["Joshua Kimmich","MF",3],["Aleksandar Pavlović","MF",2],
   ["Antonio Rüdiger","DF",1],["Jonathan Tah","DF",1],["Nico Schlotterbeck","DF",1],["Marc-André ter Stegen","GK",0,"G"]]},
 "Holanda":{ovr:86,conf:"UEFA",flag:"🇳🇱",coach:"Ronald Koeman",sq:[
   ["Cody Gakpo","FW",8],["Memphis Depay","FW",6],["Brian Brobbey","FW",5],["Xavi Simons","MF",7,"Y"],
   ["Tijjani Reijnders","MF",4],["Frenkie de Jong","MF",3],["Ryan Gravenberch","MF",3],
   ["Virgil van Dijk","DF",1],["Denzel Dumfries","DF",2],["Jurriën Timber","DF",1],["Bart Verbruggen","GK",0,"G"]]},
 "Bélgica":{ovr:82,conf:"UEFA",flag:"🇧🇪",coach:"Rudi Garcia",sq:[
   ["Romelu Lukaku","FW",9],["Jérémy Doku","FW",6],["Loïs Openda","FW",6],["Leandro Trossard","FW",5],
   ["Kevin De Bruyne","MF",8],["Youri Tielemans","MF",3],["Amadou Onana","MF",2],
   ["Zeno Debast","DF",1],["Wout Faes","DF",1],["Timothy Castagne","DF",1.5],["Thibaut Courtois","GK",0,"G"]]},
 "Croácia":{ovr:82,conf:"UEFA",flag:"🇭🇷",coach:"Zlatko Dalić",sq:[
   ["Andrej Kramarić","FW",6],["Ante Budimir","FW",6],["Ivan Perišić","FW",4],["Luka Modrić","MF",5,"S"],
   ["Mateo Kovačić","MF",3],["Luka Sučić","MF",3,"Y"],["Marcelo Brozović","MF",2],
   ["Joško Gvardiol","DF",2],["Joško Šutalo","DF",1],["Borna Sosa","DF",1],["Dominik Livaković","GK",0,"G"]]},
 "Itália":{ovr:84,conf:"UEFA",flag:"🇮🇹",coach:"Gennaro Gattuso",sq:[
   ["Mateo Retegui","FW",7],["Moise Kean","FW",6],["Federico Chiesa","FW",6],["Giacomo Raspadori","FW",4],
   ["Nicolò Barella","MF",4],["Davide Frattesi","MF",4],["Sandro Tonali","MF",3],
   ["Alessandro Bastoni","DF",1],["Riccardo Calafiori","DF",1],["Federico Dimarco","DF",2],["Gianluigi Donnarumma","GK",0,"G"]]},
 "Uruguai":{ovr:83,conf:"CONMEBOL",flag:"🇺🇾",coach:"Marcelo Bielsa",sq:[
   ["Darwin Núñez","FW",8],["Federico Valverde","MF",6],["Facundo Pellistri","FW",4],["Maxi Araújo","FW",4],
   ["Giorgian De Arrascaeta","MF",5],["Manuel Ugarte","MF",2],["Rodrigo Bentancur","MF",3],
   ["Ronald Araújo","DF",2],["José María Giménez","DF",1],["Mathías Olivera","DF",1],["Sergio Rochet","GK",0,"G"]]},
 "Colômbia":{ovr:82,conf:"CONMEBOL",flag:"🇨🇴",coach:"Néstor Lorenzo",sq:[
   ["Luis Díaz","FW",9,"S"],["Jhon Durán","FW",6],["Jhon Córdoba","FW",5],["James Rodríguez","MF",6],
   ["Richard Ríos","MF",3],["Jefferson Lerma","MF",2],["Juan Fernando Quintero","MF",3],
   ["Daniel Muñoz","DF",2],["Davinson Sánchez","DF",1],["Carlos Cuesta","DF",1],["Camilo Vargas","GK",0,"G"]]},
 "Marrocos":{ovr:83,conf:"CAF",flag:"🇲🇦",coach:"Walid Regragui",sq:[
   ["Youssef En-Nesyri","FW",7],["Brahim Díaz","MF",6],["Hakim Ziyech","FW",5],["Eliesse Ben Seghir","FW",5,"Y"],
   ["Azzedine Ounahi","MF",3],["Sofyan Amrabat","MF",2],["Bilal El Khannouss","MF",4,"Y"],
   ["Achraf Hakimi","DF",3,"S"],["Noussair Mazraoui","DF",1.5],["Nayef Aguerd","DF",1],["Yassine Bono","GK",0,"G"]]},
 "Japão":{ovr:80,conf:"AFC",flag:"🇯🇵",coach:"Hajime Moriyasu",sq:[
   ["Ayase Ueda","FW",6],["Kaoru Mitoma","FW",7],["Takefusa Kubo","FW",7],["Takumi Minamino","MF",5],
   ["Daichi Kamada","MF",5],["Ritsu Doan","FW",5],["Wataru Endo","MF",2],
   ["Ko Itakura","DF",1],["Takehiro Tomiyasu","DF",1.5],["Hiroki Ito","DF",1],["Zion Suzuki","GK",0,"G"]]},
 "Senegal":{ovr:80,conf:"CAF",flag:"🇸🇳",coach:"Pape Thiaw",sq:[
   ["Nicolas Jackson","FW",7],["Sadio Mané","FW",7,"S"],["Boulaye Dia","FW",5],["Ismaïla Sarr","FW",6],
   ["Pape Matar Sarr","MF",3],["Idrissa Gueye","MF",2],["Krépin Diatta","MF",4],
   ["Kalidou Koulibaly","DF",1],["Abdou Diallo","DF",1],["Antoine Mendy","DF",1],["Édouard Mendy","GK",0,"G"]]},
 "Suíça":{ovr:79,conf:"UEFA",flag:"🇨🇭",coach:"Murat Yakin",sq:[
   ["Breel Embolo","FW",6],["Zeki Amdouni","FW",5],["Dan Ndoye","FW",5],["Rubén Vargas","FW",5],
   ["Xherdan Shaqiri","MF",5],["Granit Xhaka","MF",3],["Remo Freuler","MF",2],
   ["Manuel Akanji","DF",1],["Ricardo Rodríguez","DF",1.5],["Nico Elvedi","DF",1],["Yann Sommer","GK",0,"G"]]},
 "Dinamarca":{ovr:79,conf:"UEFA",flag:"🇩🇰",coach:"Brian Riemer",sq:[
   ["Rasmus Højlund","FW",7],["Jonas Wind","FW",5],["Mika Biereth","FW",5,"Y"],["Christian Eriksen","MF",5],
   ["Mikkel Damsgaard","MF",4],["Morten Hjulmand","MF",2],["Pierre-Emile Højbjerg","MF",3],
   ["Joachim Andersen","DF",1],["Joakim Mæhle","DF",2],["Victor Nelsson","DF",1],["Kasper Schmeichel","GK",0,"G"]]},
 "Irã":{ovr:76,conf:"AFC",flag:"🇮🇷",coach:"Amir Ghalenoei",sq:[
   ["Mehdi Taremi","FW",8],["Sardar Azmoun","FW",6],["Alireza Jahanbakhsh","FW",4],["Mehdi Ghayedi","FW",4],
   ["Saman Ghoddos","MF",4],["Saeid Ezatolahi","MF",2],["Ali Gholizadeh","MF",4],
   ["Shojae Khalilzadeh","DF",1],["Milad Mohammadi","DF",1.5],["Majid Hosseini","DF",1],["Alireza Beiranvand","GK",0,"G"]]},
 "Coreia do Sul":{ovr:78,conf:"AFC",flag:"🇰🇷",coach:"Hong Myung-bo",sq:[
   ["Son Heung-min","FW",9,"S"],["Hwang Hee-chan","FW",6],["Oh Hyeon-gyu","FW",5],["Lee Kang-in","MF",6],
   ["Lee Jae-sung","MF",4],["Hwang In-beom","MF",3],["Hong Hyun-seok","MF",2],
   ["Kim Min-jae","DF",1],["Kim Young-gwon","DF",1],["Lee Myung-jae","DF",1],["Kim Seung-gyu","GK",0,"G"]]},
 "Áustria":{ovr:79,conf:"UEFA",flag:"🇦🇹",coach:"Ralf Rangnick",sq:[
   ["Marko Arnautović","FW",5],["Michael Gregoritsch","FW",5],["Christoph Baumgartner","MF",5],["Marcel Sabitzer","MF",4],
   ["Konrad Laimer","MF",3],["Nicolas Seiwald","MF",2],["Patrick Wimmer","MF",3],
   ["David Alaba","DF",2],["Kevin Danso","DF",1],["Maximilian Wöber","DF",1],["Patrick Pentz","GK",0,"G"]]},
 "Noruega":{ovr:81,conf:"UEFA",flag:"🇳🇴",coach:"Ståle Solbakken",sq:[
   ["Erling Haaland","FW",12,"S"],["Alexander Sørloth","FW",6],["Antonio Nusa","FW",5,"Y"],["Martin Ødegaard","MF",7],
   ["Patrick Berg","MF",2],["Fredrik Aursnes","MF",2],["Oscar Bobb","FW",4,"Y"],
   ["Leo Østigård","DF",1],["Julian Ryerson","DF",1.5],["Kristoffer Ajer","DF",1],["Ørjan Nyland","GK",0,"G"]]},
 "México":{ovr:80,conf:"CONCACAF",flag:"🇲🇽",coach:"Javier Aguirre",sq:[
   ["Santiago Giménez","FW",7],["Raúl Jiménez","FW",6],["Hirving Lozano","FW",6],["Alexis Vega","FW",5],
   ["Edson Álvarez","MF",3],["Luis Romo","MF",2],["Orbelín Pineda","MF",4],
   ["César Montes","DF",1],["Johan Vásquez","DF",1],["Jorge Sánchez","DF",1.5],["Luis Malagón","GK",0,"G"]]},
 "Canadá":{ovr:78,conf:"CONCACAF",flag:"🇨🇦",coach:"Jesse Marsch",sq:[
   ["Jonathan David","FW",8],["Cyle Larin","FW",5],["Alphonso Davies","FW",6],["Tajon Buchanan","FW",5],
   ["Stephen Eustáquio","MF",3],["Jonathan Osorio","MF",3],["Ismaël Koné","MF",2],
   ["Alistair Johnston","DF",1.5],["Moïse Bombito","DF",1],["Derek Cornelius","DF",1],["Maxime Crépeau","GK",0,"G"]]},
 "Estados Unidos":{ovr:80,conf:"CONCACAF",flag:"🇺🇸",coach:"Mauricio Pochettino",sq:[
   ["Christian Pulisic","FW",9,"S"],["Folarin Balogun","FW",6],["Timothy Weah","FW",5],["Ricardo Pepi","FW",5],
   ["Giovanni Reyna","MF",5],["Weston McKennie","MF",4],["Yunus Musah","MF",3],["Tyler Adams","MF",2],
   ["Sergiño Dest","DF",1.5],["Antonee Robinson","DF",1.5],["Chris Richards","DF",1],["Matt Turner","GK",0,"G"]]},
 "Equador":{ovr:79,conf:"CONMEBOL",flag:"🇪🇨",coach:"Sebastián Beccacece",sq:[
   ["Enner Valencia","FW",6],["Kevin Rodríguez","FW",5],["Gonzalo Plata","FW",5],["Kendry Páez","MF",6,"Y"],
   ["Moisés Caicedo","MF",3],["Alan Franco","MF",2],["Jeremy Sarmiento","FW",4],
   ["Piero Hincapié","DF",1],["Willian Pacho","DF",1],["Pervis Estupiñán","DF",1.5],["Hernán Galíndez","GK",0,"G"]]},
 "Nigéria":{ovr:78,conf:"CAF",flag:"🇳🇬",coach:"Éric Chelle",sq:[
   ["Victor Osimhen","FW",10,"S"],["Ademola Lookman","FW",7],["Victor Boniface","FW",6],["Samuel Chukwueze","FW",5],
   ["Alex Iwobi","MF",4],["Wilfred Ndidi","MF",2],["Frank Onyeka","MF",2],
   ["Calvin Bassey","DF",1],["Ola Aina","DF",1.5],["William Troost-Ekong","DF",1],["Stanley Nwabali","GK",0,"G"]]},
 "Egito":{ovr:78,conf:"CAF",flag:"🇪🇬",coach:"Hossam Hassan",sq:[
   ["Mohamed Salah","FW",11,"S"],["Omar Marmoush","FW",7],["Mostafa Mohamed","FW",5],["Mahmoud Trezeguet","FW",5],
   ["Zizo","MF",4],["Mohamed Elneny","MF",2],["Emam Ashour","MF",3],
   ["Mohamed Hamdy","DF",1],["Ahmed Hegazi","DF",1],["Mohamed Abdelmonem","DF",1],["Mohamed El Shenawy","GK",0,"G"]]},
 "Argélia":{ovr:77,conf:"CAF",flag:"🇩🇿",coach:"Vladimir Petković",sq:[
   ["Mohamed Amoura","FW",7],["Riyad Mahrez","FW",7,"S"],["Baghdad Bounedjah","FW",5],["Amine Gouiri","FW",6],
   ["Ismaël Bennacer","MF",3],["Nabil Bentaleb","MF",2],["Houssem Aouar","MF",3],
   ["Aïssa Mandi","DF",1],["Ramy Bensebaïni","DF",1.5],["Jaouen Hadjam","DF",1],["Alexandre Oukidja","GK",0,"G"]]},
 "Sérvia":{ovr:79,conf:"UEFA",flag:"🇷🇸",coach:"Dragan Stojković",sq:[
   ["Aleksandar Mitrović","FW",8],["Dušan Vlahović","FW",7],["Dušan Tadić","MF",5],["Sergej Milinković-Savić","MF",4],
   ["Filip Kostić","FW",4],["Saša Lukić","MF",2],["Lazar Samardžić","MF",3],
   ["Strahinja Pavlović","DF",1],["Nikola Milenković","DF",1],["Miloš Veljković","DF",1],["Predrag Rajković","GK",0,"G"]]},
 "Turquia":{ovr:80,conf:"UEFA",flag:"🇹🇷",coach:"Vincenzo Montella",sq:[
   ["Kenan Yıldız","FW",6,"Y"],["Arda Güler","MF",7,"Y"],["Barış Alper Yılmaz","FW",5],["Kerem Aktürkoğlu","FW",5],
   ["Hakan Çalhanoğlu","MF",5],["Orkun Kökçü","MF",3],["İsmail Yüksek","MF",2],
   ["Merih Demiral","DF",1],["Abdülkerim Bardakcı","DF",1],["Ferdi Kadıoğlu","DF",1.5],["Uğurcan Çakır","GK",0,"G"]]},
 "Austrália":{ovr:75,conf:"AFC",flag:"🇦🇺",coach:"Tony Popovic",sq:[
   ["Mitchell Duke","FW",5],["Adam Taggart","FW",4],["Martin Boyle","FW",4],["Riley McGree","MF",4],
   ["Jackson Irvine","MF",4],["Aiden O'Neill","MF",2],["Connor Metcalfe","MF",2],
   ["Harry Souttar","DF",1],["Cameron Burgess","DF",1],["Jordan Bos","DF",1.5],["Mathew Ryan","GK",0,"G"]]},
 "Costa do Marfim":{ovr:78,conf:"CAF",flag:"🇨🇮",coach:"Emerse Faé",sq:[
   ["Sébastien Haller","FW",6],["Jean-Philippe Krasso","FW",5],["Nicolas Pépé","FW",6],["Simon Adingra","FW",5],
   ["Franck Kessié","MF",4],["Seko Fofana","MF",3],["Ibrahim Sangaré","MF",2],
   ["Wilfried Singo","DF",2],["Evan Ndicka","DF",1],["Ghislain Konan","DF",1],["Yahia Fofana","GK",0,"G"]]},
 "Camarões":{ovr:76,conf:"CAF",flag:"🇨🇲",coach:"Marc Brys",sq:[
   ["Bryan Mbeumo","FW",6],["Vincent Aboubakar","FW",5],["Karl Toko Ekambi","FW",4],["Christian Bassogog","FW",4],
   ["Frank Anguissa","MF",4],["Carlos Baleba","MF",3,"Y"],["Martin Hongla","MF",2],
   ["Jean-Charles Castelletto","DF",1],["Christopher Wooh","DF",1],["Nouhou Tolo","DF",1],["André Onana","GK",0,"G"]]},
 "Tunísia":{ovr:75,conf:"CAF",flag:"🇹🇳",coach:"Sami Trabelsi",sq:[
   ["Hannibal Mejbri","MF",5,"Y"],["Youssef Msakni","FW",5],["Seifeddine Jaziri","FW",4],["Elias Achouri","FW",4],
   ["Aïssa Laïdouni","MF",3],["Ellyes Skhiri","MF",3],["Ferjani Sassi","MF",2],
   ["Montassar Talbi","DF",1],["Yassine Meriah","DF",1],["Ali Abdi","DF",1],["Aymen Dahmen","GK",0,"G"]]},
 "África do Sul":{ovr:74,conf:"CAF",flag:"🇿🇦",coach:"Hugo Broos",sq:[
   ["Lyle Foster","FW",5],["Percy Tau","FW",5],["Iqraam Rayners","FW",4],["Relebohile Mofokeng","FW",4,"Y"],
   ["Themba Zwane","MF",4],["Teboho Mokoena","MF",3],["Sphephelo Sithole","MF",2],
   ["Mothobi Mvala","DF",1],["Siyanda Xulu","DF",1],["Aubrey Modiba","DF",1],["Ronwen Williams","GK",0,"G"]]},
 "Panamá":{ovr:72,conf:"CONCACAF",flag:"🇵🇦",coach:"Thomas Christiansen",sq:[
   ["José Fajardo","FW",5],["Cecilio Waterman","FW",4],["Ismael Díaz","FW",4],["Adalberto Carrasquilla","MF",3],
   ["Aníbal Godoy","MF",2],["Cristian Martínez","MF",3],["Edgar Bárcenas","FW",4],
   ["Andrés Andrade","DF",1],["Fidel Escobar","DF",1],["Eric Davis","DF",1],["Orlando Mosquera","GK",0,"G"]]},
 "Escócia":{ovr:75,conf:"UEFA",flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",coach:"Steve Clarke",sq:[
   ["Che Adams","FW",4],["Lyndon Dykes","FW",4],["Lawrence Shankland","FW",4],["Scott McTominay","MF",5],
   ["John McGinn","MF",5],["Billy Gilmour","MF",2],["Ryan Christie","MF",4],
   ["Andrew Robertson","DF",2],["Kieran Tierney","DF",1],["Jack Hendry","DF",1],["Angus Gunn","GK",0,"G"]]},
 "Arábia Saudita":{ovr:72,conf:"AFC",flag:"🇸🇦",coach:"Hervé Renard",sq:[
   ["Salem Al-Dawsari","FW",6],["Firas Al-Buraikan","FW",5],["Saleh Al-Shehri","FW",4],["Abdullah Al-Hamdan","FW",4],
   ["Mohamed Kanno","MF",2],["Salman Al-Faraj","MF",2],["Nasser Al-Dawsari","MF",3],
   ["Ali Al-Bulaihi","DF",1],["Hassan Tambakti","DF",1],["Sultan Al-Ghannam","DF",1],["Nawaf Al-Aqidi","GK",0,"G"]]},
 "Paraguai":{ovr:74,conf:"CONMEBOL",flag:"🇵🇾",coach:"Gustavo Alfaro",sq:[
   ["Antonio Sanabria","FW",5],["Julio Enciso","FW",5,"Y"],["Adam Bareiro","FW",4],["Miguel Almirón","FW",5],
   ["Diego Gómez","MF",3],["Andrés Cubas","MF",2],["Damián Bobadilla","MF",2],
   ["Gustavo Gómez","DF",1.5],["Omar Alderete","DF",1],["Junior Alonso","DF",1],["Roberto Fernández","GK",0,"G"]]},
 "Costa Rica":{ovr:72,conf:"CONCACAF",flag:"🇨🇷",coach:"Miguel Herrera",sq:[
   ["Manfred Ugalde","FW",5],["Alonso Martínez","FW",4],["Joel Campbell","FW",4],["Carlos Mora","MF",3],
   ["Brandon Aguilera","MF",3],["Orlando Galo","MF",2],["Josimar Alcócer","FW",4,"Y"],
   ["Francisco Calvo","DF",1],["Juan Pablo Vargas","DF",1],["Carlos Martínez","DF",1],["Keylor Navas","GK",0,"G"]]},
 "Honduras":{ovr:70,conf:"CONCACAF",flag:"🇭🇳",coach:"Reinaldo Rueda",sq:[
   ["Anthony Lozano","FW",4],["Romell Quioto","FW",4],["Jorge Benguché","FW",4],["Luis Palma","FW",4],
   ["Alexánder López","MF",3],["Deybi Flores","MF",2],["Edwin Rodríguez","MF",2],
   ["Denil Maldonado","DF",1],["Marcelo Santos","DF",1],["Andy Nájar","DF",1],["Edrick Menjívar","GK",0,"G"]]},
 "Catar":{ovr:72,conf:"AFC",flag:"🇶🇦",coach:"Julen Lopetegui",sq:[
   ["Akram Afif","FW",6],["Almoez Ali","FW",6],["Yusuf Abdurisag","FW",4],["Hassan Al-Haydos","MF",4],
   ["Karim Boudiaf","MF",2],["Ahmed Fadel","MF",2],["Mohammed Muntari","FW",3],
   ["Boualem Khoukhi","DF",1],["Tarek Salman","DF",1],["Pedro Miguel","DF",1],["Meshaal Barsham","GK",0,"G"]]},
 "Uzbequistão":{ovr:73,conf:"AFC",flag:"🇺🇿",coach:"Timur Kapadze",sq:[
   ["Eldor Shomurodov","FW",6],["Igor Sergeev","FW",4],["Abbosbek Fayzullaev","FW",5,"Y"],["Otabek Shukurov","MF",3],
   ["Jaloliddin Masharipov","MF",4],["Azizbek Turgunboev","MF",3],["Jasurbek Yakhshiboev","FW",3],
   ["Abdukodir Khusanov","DF",2,"Y"],["Rustamjon Ashurmatov","DF",1],["Sherzod Nasrullaev","DF",1],["Utkir Yusupov","GK",0,"G"]]},
 "Jordânia":{ovr:71,conf:"AFC",flag:"🇯🇴",coach:"Jamal Sellami",sq:[
   ["Mousa Al-Tamari","FW",6],["Yazan Al-Naimat","FW",5],["Ali Olwan","FW",4],["Mahmoud Al-Mardi","MF",3],
   ["Nizar Al-Rashdan","MF",3],["Noor Al-Rawabdeh","MF",2],["Mahmoud Al-Aradi","MF",2],
   ["Yazan Al-Arab","DF",1],["Abdallah Nasib","DF",1],["Mohammad Abu Hasheesh","DF",1],["Yazeed Abulaila","GK",0,"G"]]},
 "Nova Zelândia":{ovr:70,conf:"OFC",flag:"🇳🇿",coach:"Darren Bazeley",sq:[
   ["Chris Wood","FW",7],["Ben Old","FW",4,"Y"],["Eli Just","FW",4],["Marko Stamenić","MF",3],
   ["Matthew Garbett","MF",3],["Joe Bell","MF",2],["Alex Greive","FW",3],
   ["Tyler Bindon","DF",1,"Y"],["Michael Boxall","DF",1],["Liberato Cacace","DF",1.5],["Alex Paulsen","GK",0,"G"]]},
 "Iraque":{ovr:71,conf:"AFC",flag:"🇮🇶",coach:"Graham Arnold",sq:[
   ["Aymen Hussein","FW",5],["Ali Jasim","FW",4,"Y"],["Mohanad Ali","FW",5],["Amir Al-Ammari","MF",3],
   ["Ibrahim Bayesh","MF",3],["Bashar Resan","MF",2],["Zidane Iqbal","MF",3,"Y"],
   ["Rebin Sulaka","DF",1],["Merchas Doski","DF",1],["Akam Hashim","DF",1],["Jalal Hassan","GK",0,"G"]]},
 "RD Congo":{ovr:75,conf:"CAF",flag:"🇨🇩",coach:"Sébastien Desabre",sq:[
   ["Yoane Wissa","FW",6],["Cédric Bakambu","FW",5],["Fiston Mayele","FW",5],["Silas Katompa","FW",5],
   ["Charles Pickel","MF",3],["Samuel Moutoussamy","MF",2],["Edo Kayembe","MF",3],
   ["Chancel Mbemba","DF",1],["Arthur Masuaku","DF",1.5],["Gédéon Kalulu","DF",1],["Lionel Mpasi","GK",0,"G"]]},
};

/* ----- Grupos A–L (1 seleção por pote, anfitriões posicionados) ----- */
const LEGACY_GROUPS = [
 ["A", ["México","Croácia","Equador","Paraguai"]],
 ["B", ["Canadá","Itália","Noruega","Costa Rica"]],
 ["C", ["Argentina","Uruguai","Nigéria","Honduras"]],
 ["D", ["Estados Unidos","Colômbia","Egito","Camarões"]],
 ["E", ["França","Marrocos","Argélia","Tunísia"]],
 ["F", ["Espanha","Japão","Sérvia","África do Sul"]],
 ["G", ["Brasil","Senegal","Turquia","Catar"]],
 ["H", ["Inglaterra","Suíça","Austrália","Uzbequistão"]],
 ["I", ["Portugal","Dinamarca","Costa do Marfim","Jordânia"]],
 ["J", ["Holanda","Irã","Panamá","Nova Zelândia"]],
 ["K", ["Bélgica","Coreia do Sul","Escócia","Iraque"]],
 ["L", ["Alemanha","Áustria","Arábia Saudita","RD Congo"]],
];

