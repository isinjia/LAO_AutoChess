// Scenario: 8 chapters of 8 stages, each with a short scene before it. Original writing set in the Last Origin world
// (Orca, the commander, the Iron Bugs); no lines are copied from the game, but every unit speaks the way she does in
// the original (titles for the commander, speech level, catchphrases) - see tools/corpus/notes_*.md.
//
// introBg / stageBg / outroBg: original dialogue backgrounds behind the prologue, the stage scenes and the epilogue
// line: [speaker, text]   speaker = roster unit id (portrait), 'commander' (the player) or 'narr' (narration)
// stage.final: 'elite' (a stage captain) or a boss rig with tricks; stage 4 and 8 of a chapter are boss stages
// stage.cruel: the boss comes "cruel" (one extra trick, harsher numbers); a chapter's `cruel` is the default
//
// Setting rule: Iron Bugs never enter water. The Orca is safe at sea; every fight happens on land, and enemies
// always come from the land side, even on the coast or on a bridge.
//
// The story, "Twelve hours of the commander": the commander goes ashore with Constantia to check an old lighthouse
// and the radio goes dead. For twelve hours the squads of the Orca mount their own rescues, each in her own way:
// Valhalla charges first (1), Steel Line follows the wrong footprints into the city (2), Raven and the Sky Knights
// search a canyon bridge because a book said so (3), the public servants switch a relay on and find the signal (4),
// Lilith races the other escorts to the lighthouse (5) and finds that every rescue has dragged the Iron Bugs toward
// it, so the Strikers stage a very scientific diversion (6). The twist: the commander was fine all along -
// Constantia dried the radio hours ago and kept quiet to give the commander one day off. The commander takes the
// radio back, Steel Line and Valhalla hold the frozen bridge (7) and everyone meets under the lighthouse (8).
(function (root) {
  const CHAPTERS = [
    {
      id: 1, title: '통신 두절', sub: '오전 7시, 완벽한 나는 기다리지 않는다', bg: 'assets/bg_bridge_storm.jpg', cruel: false,
      introBg: 'BG_Lobby', stageBg: 'BG_CliffNight', outroBg: 'BG_Cliff', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오전 6시. 사령관은 콘스탄챠 한 명만 데리고 해안의 옛 등대로 나갔다. 기상 관측기 점검, 두 시간짜리 외출이었다. 오전 7시, 통신이 끊겼다.'],
        ['labiata', '사령관님 단말 응답 없음. 콘스탄챠도요. …규정상 두 시간은 대기합니다. 비가 심해서 통신이 끊긴 것뿐일 수도 있어요.'],
        ['leona', '두 시간? 사령관이 사라졌는데 완벽한 나를 두고 두 시간을 기다리라고? 발할라, 전원 장비 점검. 10분 뒤에 나간다!'],
        ['labiata', '레오나 대장. 지금 제가 지휘권자예요. 대기해 주세요.'],
        ['leona', '들었어. 그리고 거절할게. 시가전은 발할라의 주특기야. 사령관이 간 해안 도로는 내 구역이고. 님프, 발키리, 따라와!'],
        ['nymph', '자, 잠깐만요, 레오나님! 라비아타님 말씀도… 아하하, 네, 갈게요. 가요.'],
        ['narr', '한편, 등대에서.'],
        ['constantia', '어머… 주인님, 통신기가… 빗물 고인 데에 떨어졌어요. 죄송해요.'],
        ['commander', '…콘스탄챠. 라비아타가 걱정하겠군.'],
        ['constantia', '언니는 침착한 분이니까요. 후후, 비가 그칠 때까지는 아무도 못 와요. 차라도 끓일게요. 주인님은 거기 앉아 계세요.'],
      ],
      outro: [
        ['narr', '다리 끝까지 밀고 나간 발할라는 니드호그를 쓰러뜨렸다. 사령관의 흔적은 없었다. 비는 더 거세졌다.'],
        ['valkyrie', '다리 끝 도달. 각하 흔적 없음. 탄약 잔량 48퍼센트. 이상입니다.'],
        ['nymph', '레오나님, 조금만 쉬죠? 네? 비도 이렇게 오는데…'],
        ['leona', '…시가전은 발할라의 주특기지만, 수색은 아니었네. 흥. 다음 구역으로 갈게. 빈손으로는 안 돌아가.'],
        ['labiata', '레오나 대장, 들리세요? 돌아오세요. 다른 부대를 보낼게요.'],
        ['leona', '…잡음이 심해서 안 들리네. 발할라, 전진해!'],
      ],
      stages: [
        { name: '해안 도로 진입', final: 'elite', lines: [['leona', '해안 도로야. 사령관이 아침에 지나간 길이지. 발할라, 산개해서 나를 따라와!'], ['nymph', '네, 레오나님! …저기, 철충이 도로 위에 벌써… 자, 잠깐만요!']] },
        { name: '빗속의 요금소', final: 'elite', lines: [['valkyrie', '요금소 전방 적 다수. 사격 개시 허가를.'], ['leona', '허가할게. 발키리, 저격은 네 몫이야. 나머진 내가 완벽하게 처리하겠어.']] },
        { name: '전복된 수송차', final: 'elite', lines: [['nymph', '수송차가 뒤집혀 있어요. 사령관님 차는… 아니네요. 후훗, 다행이에요.'], ['valkyrie', '안도는 뒤로. 수송차 뒤에서 적 접근. 교전 대기.']] },
        { name: '다리 입구의 방패', final: 'e_Goltarion_N', lines: [['valkyrie', '골타리온. 방어막 전개 확인. 체력 3분의 2와 3분의 1에서 막이 섭니다.'], ['leona', '막이 서면 쏘지 마. 탄 아까워. 막이 꺼지는 순간 전원 집중 사격이야!']] },
        { name: '비 내리는 중앙 차선', final: 'elite', lines: [['leona', '시야가 나쁘네. 사령관, 이런 데서 뭘 하는 거야. 나를 이렇게 뛰게 하고.'], ['nymph', '레오나님, 지금 혼잣말하신 거… 아, 아니에요. 전방에 적이요!']] },
        { name: '끊어진 가로등 길', final: 'elite', lines: [['valkyrie', '가로등 전부 소등. 열원 탐지로 전환. 적 12. 11. 10.'], ['leona', '세는 것보다 쏘는 게 빨라, 발키리.']] },
        { name: '다리 끝 전망대', final: 'elite', lines: [['nymph', '전망대예요! 높은 곳이면 사령관님이 보이실지도… 어머, 철충이 먼저 올라와 있네요.'], ['leona', '그럼 내려 보내지. 발할라, 돌격!']] },
        { name: '다리 끝의 포식자', final: 'e_Nidhogg_N', lines: [['valkyrie', '니드호그. 공격이 끊기면 재생합니다. 1.5초. 이상.'], ['leona', '1.5초도 안 줘. 쉬지 않고 쏠 거야. 나를 따라와!']] },
      ],
    },
    {
      id: 2, title: '스틸라인, 출동!', sub: '오전 9시, 그 발자국은 각하의 것이 아니었다', bg: 'assets/bg_city.jpg', cruel: false,
      introBg: 'BG_Hangar', stageBg: 'BG_Ruin', outroBg: 'BG_CoastCity', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오전 9시. 통신 두절 두 시간. 라비아타는 전 부대를 소집해 수색 구역을 나눴다. 발할라는 아직 돌아오지 않았다.'],
        ['labiata', '스틸라인은 해안 도로로 가서 레오나 대장을 데려와 주세요. 도시 외곽까지만이에요. 외곽까지만.'],
        ['brownie', '각하가 실종이라니, 말이 됩니까! 스틸라인이 각하를 찾아야 하지 말입니다!'],
        ['leprechaun', '브라우니!! 라비아타 님 말씀을 끝까지 들으십시오. 외곽까지만입니다. 알겠습니다, 스틸라인 출동합니다. 승리!'],
        ['impet', '외곽까지만, 이라고 하셨지? 애들아, 들었지? 쯧쯧, 브라우니 얼굴 보니 못 들은 것 같은데.'],
        ['gnome', '걱정 마세요. 제가 가족을 지켜 드릴게요. 브라우니도요.'],
        ['narr', '해안 도로 끝, 비에 젖은 전투화 발자국이 도시 쪽으로 이어져 있었다.'],
        ['brownie', '헤헤, 레프리콘 상병님! 발자국이 있지 말입니다! 분명 각하 발자국임다! 이쪽임다!'],
        ['gnome', '…그건 레오나 대장님 전투화 자국 같은데요.'],
        ['leprechaun', '브라우니! 멈추십시오! 거긴 도시 안쪽… 아자젤 맙소사. 임펫 중사님, 쫓아가죠.'],
        ['narr', '한편, 등대에서.'],
        ['constantia', '주인님, 샌드위치예요. 오늘은 제가 좋아하는 걸로 만들어 봤거든요.'],
        ['commander', '…저 소리. 포성이다. 레프리콘의 기관총 소리야.'],
        ['constantia', '어머, 그러네요. 언니가 훈련을 시키나 봐요. 후후, 주인님은 드세요. 식어요.'],
      ],
      outro: [
        ['narr', '시청 계단의 엑스큐셔너가 무너졌다. 스틸라인은 도시 한복판에 서 있었다. 레오나도, 사령관도 없었다.'],
        ['leprechaun', '적 사살 31체. 분대 사상자 0. 그리고… 현재 위치, 도시 중심. 외곽에서 2킬로미터 안쪽입니다. 하아…'],
        ['brownie', '…레프리콘 상병님. 저 때문임까.'],
        ['leprechaun', '아자젤 맙소사, 그걸 지금 묻습니까! 브라우니 덕에 도시 철충 절반이 깨어났습니다. …그리고 브라우니 덕에 전부 쓰러졌죠.'],
        ['gnome', '괜찮아요, 브라우니. 가족이니까 같이 돌아가면 돼요. 발포 콘크리트는 아직 남았어요.'],
        ['impet', '돌아가긴 뭘 돌아가. 라비아타 님, 임펫입니다. 스틸라인 도시 중심 도달, 사령관님 흔적 없음. 다음 지시를. …네? 레이븐 양이 나왔다고요?'],
      ],
      stages: [
        { name: '도시 외곽 검문소', final: 'elite', lines: [['leprechaun', '검문소입니다. 브라우니, 9시 방향! 노움 병장님은 콘크리트 준비를!'], ['brownie', '9시 방향 확인했지 말입니다! …어, 어어, 생각보다 많슴다!']] },
        { name: '발자국을 따라', final: 'elite', lines: [['brownie', '발자국이 이쪽으로 이어지지 말입니다! 각하, 조금만 기다리십쇼!'], ['impet', '그 발자국 보폭, 각하보다 한참 짧아. 쯧쯧. 어쨌든 적이 오니까 펑, 하고 터트려 줄게.']] },
        { name: '무너진 상가 거리', final: 'elite', lines: [['gnome', '상가가 전부 무너져 있어요. 길이 하나뿐이에요. 제가 앞에 설게요. 걱정 마세요.'], ['leprechaun', '노움 병장님 뒤에 종대로. 브라우니, 병장님 앞으로 나가면 혼납니다.']] },
        { name: '광장의 어미 새', final: 'e_EmperorChick_N', lines: [['impet', '광장 한가운데에 엠페러 칙. 체력 절반에서 새끼를 여섯 부른다. 애들아, 부르는 순간 범위로 쓸어.'], ['brownie', '새, 새끼라도 철충이지 말입니다! 스틸라인… 스틸라인 사격 준비임다!']] },
        { name: '지하철 입구', final: 'elite', lines: [['leprechaun', '지하철 입구에서 올라옵니다. 계단은 좁죠. 경기관총에는 최고의 자리입니다.'], ['brownie', '상병님 옆자리는 제가 지키겠슴다! 헤헤, 그, 그래야 덜 무섭… 아닙니다!']] },
        { name: '불 꺼진 백화점', final: 'elite', lines: [['gnome', '백화점이에요. 어두워요. …누가 제 등 뒤에 서 있는데, 가족 맞죠?'], ['impet', '나야, 나. 쯧, 노움 뒤에 숨은 브라우니도 있고. 전방 유리창 너머, 온다.']] },
        { name: '시청 앞 대로', final: 'elite', lines: [['leprechaun', '시청 앞 대로입니다. 사방이 열려 있죠. 브라우니, 여기서 도망치면 평생 바보입니다.'], ['brownie', '도, 도망 안 칩니다! 각하께 가는 길이지 말입니다! 스틸라인… 총원… 전투위치로!']] },
        { name: '시청 계단의 집행자', final: 'e_Executioner_EW', lines: [['impet', '엑스큐셔너. 14초마다 제일 열심히 싸운 애를 5초 묶어 놔. 묶이면 나머지가 메워.'], ['leprechaun', '브라우니! 브라우니가 묶이면 제가 메웁니다. 제가 묶이면… 브라우니가 메우십시오. 할 수 있죠?']] },
      ],
    },
    {
      id: 3, title: '누나가 간다', sub: '오전 11시, 책에서 봤다는 높은 곳', bg: 'assets/bg_bridge.jpg', cruel: false,
      introBg: 'BG_SubmarineHangar', stageBg: 'BG_13_5', outroBg: 'BG_13_6', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오전 11시. 통신 두절 네 시간. 두 부대가 돌아오지 않았다. 격납고에서 레이븐이 날개를 폈다.'],
        ['labiata', '두 부대가 각자 다른 구역에 있어요. 더 보내면 세 부대를 찾아야 할지도 몰라요.'],
        ['khan', '라비아타, 다음 지휘권자는 나다. 내가 나서면 되겠나? 호드는 선제공격이 신념이다.'],
        ['labiata', '아뇨. 칸 대장님은 배를 지켜 주세요. 배가 비면 사령관님이 돌아올 곳이 없어요.'],
        ['raven', '그럼 누나가 간다. 우리 꼬맹이 사령관은 누나가 찾아야지. 하늘에서 보면 금방이야.'],
        ['harpy', '책에서 봤어! 실종자는 높은 곳에 올라가서 신호를 기다린대. 이 근처에서 제일 높은 건… 협곡 대교!'],
        ['hraesvelgr', '레이더에 협곡 대교 방향 열원 다수. 사령관님일 가능성은 낮습니다만, 확인은 필요하군요. 다들 들으십시오. 생환이 1순위입니다.'],
        ['raven', '오케이. 하르페이아, 흐레스벨그, 가자. 레오나랑 브라우니는 땅에서 헤매게 두고.'],
        ['narr', '한편, 등대 꼭대기에서.'],
        ['commander', '협곡 대교 쪽에 연기. 공중 전투다. …레이븐이군.'],
        ['constantia', '눈이 좋으시네요. 후후. 그래도 주인님은 여기가 더 안전해요. 저 다리까지는 걸어서 세 시간이거든요.'],
        ['commander', '통신기는.'],
        ['constantia', '아직… 젖어 있어요. 조금만 더 말려야 해요. 어머, 찻물이 끓네요.'],
      ],
      outro: [
        ['narr', '다리 끝에 매달려 있던 니드호그가 협곡 아래로 떨어졌다. 하늘에서 내려다본 다리 위에 사령관은 없었다.'],
        ['harpy', '책이… 틀렸어? 그럴 리 없는데. 그 책 참고 문헌이 서른 개였다구.'],
        ['raven', '책이 틀린 게 아니고, 우리 꼬맹이가 책대로 안 움직이는 거지. 누나가 제일 잘 알아.'],
        ['hraesvelgr', '소대원 전원 생환. 알파 씨 통신입니다. 공장 지대 중계기를 켜면 사령관님 단말의 미약 신호를 잡을 수 있다고.'],
        ['raven', '그럼 그걸 켜러 가는 애들을 누나가 지켜 줘야겠네. 온다, 집중해! 이동한다!'],
      ],
      stages: [
        { name: '협곡 진입로', final: 'elite', lines: [['raven', '협곡 진입로. 다리 위에 벌써 바글바글하네. 온다, 집중해!'], ['harpy', '헤헷, 다리 위 철충은 고소공포증이 없대. 책에서 봤어.']] },
        { name: '첫 번째 교각 위', final: 'elite', lines: [['hraesvelgr', '첫 교각 상부에 적 집결. 전파 교란 확인, 통신은 짧게 하십시오.'], ['raven', '짧게? 오케이. 내가 견제할 테니까 진형을 짜!']] },
        { name: '바람 부는 중앙 경간', final: 'elite', lines: [['harpy', '꺅?! 바람이 너무 세! 책에서는 이런 거 안 나왔다구!'], ['hraesvelgr', '횡풍 초속 14미터. 고도 낮추고 교각 뒤로. 바람은 적도 똑같이 맞습니다.']] },
        { name: '교각 위의 집행자', final: 'e_Executioner_EW', cruel: true, lines: [['hraesvelgr', '엑스큐셔너 강화형. 봉인 주기 12초, 방어막까지 들고 있습니다. 봉인 대상은 피해 1위입니다.'], ['raven', '그럼 피해 1위를 돌려 가면서 하자. 누나가 먼저 맞아 줄게. 다음은 하르페이아!']] },
        { name: '추락한 화물 컨테이너', final: 'elite', lines: [['harpy', '컨테이너 안에 뭐가 있을까? 실종자는 밀폐된 공간에 숨는대. 그거 편견이야? 아, 철충이 숨어 있었네.'], ['raven', '하르페이아, 책 좀 그만 보고 앞을 봐!']] },
        { name: '케이블 사이', final: 'elite', lines: [['hraesvelgr', '주 케이블 사이로 진입. 레이더 반사가 어지럽습니다. 시각 확인으로 전환.'], ['raven', '눈으로 보니까 더 많은데? 뭐, 누나한테 불가능이란 없지.']] },
        { name: '전망 쉼터', final: 'elite', lines: [['harpy', '전망 쉼터! 여기가 제일 높아! 사령관, 있어? …없어. 철충은 있고.'], ['raven', '꼬맹이, 어디 있는 거야. 누나 진짜 화낸다.']] },
        { name: '다리 끝에 매달린 것', final: 'e_Nidhogg_N', cruel: true, lines: [['hraesvelgr', '니드호그 강화형. 1.3초 멈추면 재생, 거기에 봉인까지. 다들 들으십시오. 사격을 끊지 않습니다.'], ['raven', '끊지 않는다, 오케이. 하르페이아, 네가 묶이면 누나가 두 배로 쏜다!']] },
      ],
    },
    {
      id: 4, title: '공무원의 정석', sub: '정오, 중계기를 켜면 신호가 잡힌다', bg: 'assets/bg_plant.jpg', cruel: true,
      introBg: 'BG_Meeting03', stageBg: 'BG_Maintenance01', outroBg: 'BG_Maintenance02', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '정오. 통신 두절 다섯 시간. 회의실의 지도에는 수색 구역이 세 개나 그려져 있었고, 전부 비어 있었다.'],
        ['lemonadealpha', '이대로는 수색 범위만 넓어져요. 공장 지대의 옛 통신 중계기를 켜면 주인님 단말의 미약 신호를 잡을 수 있어요. 제 견해예요.'],
        ['labiata', '중계기 전원은요?'],
        ['lemonadealpha', '공장 자체 발전기가 살아 있는 것으로 보여요. 해킹은 제가 합니다. 호위가 필요해요.'],
        ['lrl', '짐의 권속을 찾는 일이로다! 사역마들, 짐을 따르라! …어, 알파도 가는 거지? 가는 거지?'],
        ['amy', '후후, LRL. 우리 자기가 들으면 좋아하겠군요. 저도 가겠어요. 정보전은 제 전공이니까.'],
        ['sylphid', '호위는 초 쿨한 내가 맡는다. 호위기가 뚫리면 초 굴욕이거든? 그런 일은 없어.'],
        ['banshee', '저는… 명령만 주십시오. 공장 진입, 가능합니다. 감정은… 잘 모르겠습니다. 가겠습니다.'],
        ['narr', '한편, 등대에서.'],
        ['constantia', '통신기를 분해해서 말리고 있어요. 어머, 예비 배터리가… 제 가방에 있었네요. 후후.'],
        ['commander', '그럼 고칠 수 있는 거군.'],
        ['constantia', '기판이 조금만 더 마르면요. 주인님, 그동안 책이라도 읽으세요. 등대지기가 두고 간 책이 있거든요.'],
      ],
      outro: [
        ['narr', '중계기 탑 위의 둥지가 타오르고, 낡은 중계기가 켜졌다. 알파의 단말에 희미한 점 하나가 찍혔다.'],
        ['lemonadealpha', '신호 포착. 해안 등대예요. 생체 신호 두 개, 둘 다 안정적. …주인님은 무사한 것으로 보여요. 심박이 아주 느긋해요.'],
        ['lrl', '사령관은 역시 짐을 기다리고 있었노라! …히잉, 다행이야… 진짜 다행이야…'],
        ['amy', '어머나. 그런데 문제가 하나 있군요. 수색조들이 끌어낸 철충이 전부 등대 방향으로 흘러가고 있어요. 느긋한 심박이 오래 못 가겠죠?'],
        ['banshee', '기쁩, 니다. 그리고 걱, 정됩니다. 두 가지를 동시에 느끼는 건 처음입니다.'],
        ['sylphid', '그럼 초 빨리 가야겠네. 등대 호위는 내가… 아, 리리스 씨가 먼저 뛰어나갔다고?'],
      ],
      stages: [
        { name: '공장 지대 철책', final: 'elite', lines: [['lemonadealpha', '철책 너머가 공장 지대예요. 경비 철충의 순찰 간격은 40초로 보여요. 그 사이에 들어갑니다.'], ['sylphid', '40초면 초 넉넉해. 내가 먼저 간다. 헤헤.']] },
        { name: '컨베이어 홀', final: 'elite', lines: [['lrl', '컨베이어가 움직이고 있노라! 짐의 마력이… 아니 발전기가 살아 있구나!'], ['amy', '그 소리에 철충도 깨어났군요. 명중! LRL, 제 뒤로 와요.']] },
        { name: '변압기 마당', final: 'elite', lines: [['banshee', '변압기 마당. 사격 시 발전기 손상 가능성 있습니다. 조준은 적만.'], ['lemonadealpha', '네. 변압기를 맞히면 중계기도 끝이에요. 사격은 정확하게.']] },
        { name: '조립 라인의 왕자', final: 'e_IronPrince_N', cruel: false, lines: [['lemonadealpha', '철의 왕자. 소환, 방어막, 봉인을 전부 가진 개체예요. 순서는 막 먼저, 소환은 체력 절반에서.'], ['sylphid', '전부 가졌으면 전부 깨면 되지. 초 쿨하게 간다!']] },
        { name: '관리 사무동', final: 'elite', lines: [['amy', '사무동 서류함에 중계기 비밀번호가 있을지도. 흐응… 사람 손으로 쓴 메모군요. 반가워요.'], ['lrl', '짐도 읽을 수 있노라! …어, 글자가 번졌어. 이씨!']] },
        { name: '옥상 통로', final: 'elite', lines: [['banshee', '옥상 통로. 좌우 낙하 위험. 적은 전방에서만 옵니다.'], ['sylphid', '좁은 길에서 호위기는 초 멋있지. 다 내 뒤에 서.']] },
        { name: '중계기 탑 아래', final: 'elite', lines: [['lemonadealpha', '탑 아래 제어반이에요. 해킹에 90초. 그동안 아무도 제 옆에 못 오게 해 주세요.'], ['amy', '90초. 우리 자기를 찾는 90초라면 밤까지도 지켜 드리죠. 대비하세요!']] },
        { name: '탑 위의 둥지', final: 'e_EmperorChick_N', lines: [['lemonadealpha', '엠페러 칙 강화형이 탑 위에 둥지를 틀었어요. 소환이 두 번, 재생까지. 둥지를 치우지 않으면 중계기도 못 켜요.'], ['lrl', '짐의 사역마들이여, 새를 쫓아라! …짐은 뒤에서 주문을 외우겠노라. 이건 작전이다, 작전!']] },
      ],
    },
    {
      id: 5, title: '호위의 자격', sub: '오후 1시, 리리스는 기다리지 않는다', bg: 'assets/bg_city_dusk.jpg', cruel: true,
      introBg: 'BG_Hallway', stageBg: 'BG_Soulworker1', outroBg: 'BG_Soulworker2', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오후 1시. 통신 두절 여섯 시간. 사령관의 위치가 나왔다. 그리고 복도를 달려 나가는 발소리가 들렸다.'],
        ['blacklilith', '주인님 위치가 나왔는데도 기다리라고, 라비아타? 리리스는 안 기다려. 호위는 리리스 혼자로 충분하니까.'],
        ['labiata', '리리스. 혼자는 안 돼요. 등대까지는 도시를 가로질러야 해요.'],
        ['blacklilith', '다른 아이들은 방해만 돼. …하지만 주인님께 미움받긴 싫으니까. 셋까지는 데려가 줄게. 후후.'],
        ['eternity', '아아… 주인님이 홀로 등대에 계시다니. 제가 함께 가겠어요. 무덤처럼 조용한 등대라니, 왠지 설레네요.'],
        ['titania', '흐응. 여왕도 간다. 너희만 보내면 바보 같은 짓을 할 테니까.'],
        ['daphne', '어머나! 그, 그럼 간호사도 필요하겠네요… 티타니아 언니도 가시잖아요. 추, 출전할게요!'],
        ['blacklilith', '좋아. 셋. 더는 안 받아. 주인님, 리리스가 가요.'],
        ['narr', '한편, 등대에서.'],
        ['constantia', '…주인님, 잠드셨네요. 밤새 서류를 보셨으니까요.'],
        ['constantia', '하루만. 하루만 이렇게 쉬시게 해 드리고 싶었거든요. 나쁜 콘스탄챠네요. 후후… 언니한테는 비밀이에요.'],
      ],
      outro: [
        ['narr', '언덕 위의 엑스큐셔너가 쓰러졌다. 언덕 아래로 등대가 보였다. 그리고 등대로 이어지는 길 위에 철충의 긴 행렬이 보였다.'],
        ['blacklilith', '…주인님 쪽으로 가는 줄이 너무 길어요. 전부 치우기엔 리리스 혼자로는… 아니. 치워요. 치울 거예요.'],
        ['titania', '여왕이 말했지. 바보 같다고. 그 줄을 셋이서 어떻게 치워.'],
        ['eternity', '저 긴 행렬을 보니… 장례 행렬 같네요. 후훗, 저들의 것이면 좋겠어요.'],
        ['daphne', '휴… 다친 분은 없어요. 하지만 저 줄에 들어가면 제가 돌볼 손이 모자랄 거예요. 알파 양, 들리세요?'],
        ['lemonadealpha', '들려요. 양동이 필요해요. 스트라이커즈가 공장 지대에서 소리를 낼게요. 그동안 리리스는 등대 앞 언덕을 지켜 주세요.'],
        ['blacklilith', '…주인님 앞을 리리스가 지키는 건 당연하죠. 알파 양, 양동은 빨리 해 주세요.'],
      ],
      stages: [
        { name: '노을 진 고가도로', final: 'elite', lines: [['blacklilith', '고가도로 위. 주인님께 가는 제일 빠른 길이에요. 막는 건 전부 부술게요.'], ['titania', '빠르긴 하지. 숨을 곳이 없어서 적도 빠르게 오겠지만. 흐응.']] },
        { name: '버스 종점', final: 'elite', lines: [['daphne', '버스 종점이랍니다. 멸망 전엔 여기서 사람들이 집에 갔겠죠… 어머나, 버스 안에 철충이!'], ['eternity', '집에 가지 못한 분들의 자리에 저런 게 앉아 있다니. 비워 드려야겠네요. 아아…']] },
        { name: '옛 병원 앞', final: 'elite', lines: [['daphne', '병원이에요! 의약품이 남아 있을지도… 다프네가 잠깐 들어가 볼게요. 금방 나올 테니!'], ['blacklilith', '2분 줄게, 다프네. 2분 뒤엔 주인님 쪽으로 가. 입구는 리리스가 막을 테니까.']] },
        { name: '교차로의 방패', final: 'e_Goltarion_N', lines: [['titania', '골타리온 강화형. 막이 세 번 서고, 절반에서 부하를 부른다. 여왕은 막이 설 때 쉬겠어.'], ['blacklilith', '쉬어. 리리스는 막이 꺼지는 순간만 노릴 거야. 주인님 호위를 막는 건 용서 안 해.']] },
        { name: '해안 쪽 주택가', final: 'elite', lines: [['eternity', '주택가예요. 집집마다 조용하네요. 관 속처럼. 후훗, 철충만 빼면 완벽한데.'], ['titania', '그 비유, 다음부턴 빼. 전방, 담 넘어 온다.']] },
        { name: '공원 묘지', final: 'elite', lines: [['eternity', '묘지… 아아, 여기서 싸우게 될 줄은. 주인님, 이터니티는 여기서도 죽을 만큼 행복해요.'], ['blacklilith', '이터니티, 죽지는 마. 주인님이 슬퍼하시니까. …그 다음은 리리스가 슬프고.']] },
        { name: '등대로 가는 언덕길', final: 'elite', lines: [['blacklilith', '언덕 너머가 등대예요. 주인님… 거의 다 왔어요. 리리스가 가요.'], ['daphne', '리, 리리스 양, 조금만 천천히! 숨이… 어머나, 언덕 위에 뭔가 서 있어요!']] },
        { name: '언덕 위의 집행자', final: 'e_Executioner_EW', lines: [['titania', '엑스큐셔너 강화형. 12초마다 하나를 묶고, 막도 세운다. 여왕이 묶이면 알아서들 해.'], ['blacklilith', '리리스가 묶이면 주인님께 1초 늦어요. 그러니까 묶이기 전에 끝내. 전부.']] },
      ],
    },
    {
      id: 6, title: '스트라이커즈의 과학', sub: '오후 2시, 본녀의 완전무결한 양동', bg: 'assets/bg_plant_red.jpg', cruel: true,
      introBg: 'BG_Camp3', stageBg: 'BG_Soulworker3', outroBg: 'BG_Soulworker4', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오후 2시. 통신 두절 일곱 시간. 용광로 공장 앞에서 머큐리가 이상한 상자를 열었다.'],
        ['mercury', '본녀의 완전무결한 양동 작전이와요! 용광로 공장의 사이렌을 울려 철충을 이쪽으로 끌어올 것이와요. 오호호!'],
        ['tiamat', '…사이렌이 아니라 저희 포성이 끌어오겠죠. 티아멧, 출격합니다.'],
        ['thetis', '꺄하핫! 운디네도 왔어? 벌레 싫다고 안 했어~? 철충도 벌레거든?'],
        ['undine', '노… 농! 싫, 싫은 건 더위라구! 용광로가 더운 건 어쩔 수 없잖아! 흥!'],
        ['mercury', '그리고 이것! 철충이 좋아하는 소리 주파수를 본녀가 연구했사와요. 길잡이 메기의 울음과 아주 유사…'],
        ['tiamat', '머큐리, 그냥 쏴. 후훗.'],
        ['narr', '한편, 등대에서.'],
        ['commander', '…공장 쪽에서 사이렌. 그리고 저 이상한 소리. 머큐리군.'],
        ['constantia', '…머큐리 양이네요. 저건 못 속이겠어요. 주인님. 통신기는… 사실 아까 말랐어요. 배터리도 넣었어요.'],
        ['commander', '콘스탄챠.'],
        ['constantia', '죄송해요. 하루만, 조용히 쉬시게 하고 싶었거든요. 그런데 이젠 다들 저 때문에 저렇게… 어머, 저 울고 있나요.'],
        ['commander', '…차는 맛있었다. 샌드위치도. 켜라, 콘스탄챠. 다음 휴가는 배에서 받겠다.'],
      ],
      outro: [
        ['narr', '용광로 안의 니드호그가 쇳물 속으로 무너졌다. 그 순간, 모든 부대의 통신기에 같은 목소리가 들렸다.'],
        ['commander', '오르카 전 부대. 사령관이다.'],
        ['mercury', '사, 사령관! 본녀의 메기가 효과가 있었사와요! 오호호… 호… 무사하시와요? 무사하신 거지요?'],
        ['tiamat', '…다행이에요. 정말. 사령관, 티아멧 보고합니다. 양동 성공. 철충 절반이 공장에 묶였어요.'],
        ['commander', '잘했다. 나머지 절반은 등대로 온다. 전원, 등대 앞 다리로 집결한다. 레오나, 브라우니, 레이븐, 리리스. 들리나.'],
        ['leona', '…들려. 사령관, 반나절 동안 뭘 한 거야.'],
        ['commander', '차를 마셨다.'],
        ['leona', '…완벽한 나를 반나절 뛰게 해 놓고, 차를?! 사령관! 거기서 꼼짝도 하지 마! 그건 명령이야!'],
        ['thetis', '꺄하핫! 레오나 대장님이 사령관님한테 명령했어요~! 운디네, 들었어?'],
        ['undine', '들었어… 나나나나는 그런 말 못 해. 흥.'],
      ],
      stages: [
        { name: '용광로 정문', final: 'elite', lines: [['tiamat', '정문 확보가 먼저예요. 철충 습격 확인. 티아멧 출격합니다.'], ['mercury', '본녀가 길잡이 메기 소리를 틀 테니 다들 귀를… 아, 벌써 오고 있사와요!']] },
        { name: '사이렌 제어실', final: 'elite', lines: [['thetis', '사이렌 제어실, 거리 60, 방위 2시! 테티스가 먼저 봤어요~ 킥킥.'], ['undine', '봤으면 길이나 열어! 이 운디네가 스위치를 올릴 테니까!']] },
        { name: '주조 공장 바닥', final: 'elite', lines: [['undine', '바, 바닥이 뜨거워! 트레비앙이고 뭐고 다 녹겠어! 테티스는 위치 지켜!'], ['thetis', '지키고 있어~ 운디네 발 밑, 거리 0에 철충! 메-롱.']] },
        { name: '용광로 앞 어미 새', final: 'e_EmperorChick_N', lines: [['tiamat', '엠페러 칙 강화형. 절반과 20퍼센트에서 여섯씩 부르고, 쉬면 재생해요. 부르는 순간 범위, 그 다음은 쉬지 않고.'], ['mercury', '완벽한 본녀의 계산에 따르면 새끼는 열두 마리! 과학은 틀리지 않사와요!']] },
        { name: '슬래그 야적장', final: 'elite', lines: [['mercury', '슬래그는 혈액순환에 좋다고 들었사와요. 전투가 끝나면 몇 조각 챙겨… 왜 다들 그런 눈으로 보시와요?'], ['tiamat', '머큐리, 앞. 철충이 더 많이 왔어. 양동은 성공 중이야.']] },
        { name: '냉각탑 사이', final: 'elite', lines: [['thetis', '냉각탑 사이, 거리 30, 적 다수! 사령관님이 들으시면 테티스 칭찬하실 텐데~'], ['undine', '칭찬은 이 천재가 받을 거라구! 네리한테도 자랑할 거야!']] },
        { name: '화물 철도 승강장', final: 'elite', lines: [['tiamat', '승강장이에요. 철충이 등대 쪽에서 되돌아오고 있어요. 양동이 먹혔어요. 치사할 만큼 많이.'], ['mercury', '본녀의 완전무결한 작전이 증명되었사와요! 오호호호! …조, 조금 많긴 하네요.']] },
        { name: '용광로 안의 포식자', final: 'e_Nidhogg_N', lines: [['tiamat', '니드호그 강화형. 1.3초 쉬면 재생, 12초마다 봉인. 티아멧이 먼저 들어갈게요. 사격은 제 뒤에서.'], ['undine', '혼자 다 하려는 버릇, 또 나왔다구! 이 운디네도 간다! 테티스, 거리 불러!']] },
      ],
    },
    {
      id: 7, title: '얼어붙은 다리 위에서', sub: '오후 4시, 스틸라인이 벽, 발할라가 칼', bg: 'assets/bg_bridge_ice.jpg', cruel: true,
      introBg: 'BG_CliffNight', stageBg: 'BG_HoleLight', outroBg: 'BG_Ruin', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오후 4시. 통신 두절 아홉 시간, 통신 복구 두 시간. 등대로 이어지는 다리에 밤바람이 불어 노면이 얼었다. 발할라와 스틸라인이 다리 입구에서 마주쳤다.'],
        ['leona', '발할라 탄약 20퍼센트. 완벽한 나도 탄은 못 만들어. 스틸라인, 보급은?'],
        ['leprechaun', '스틸라인 탄약 70퍼센트, 발포 콘크리트 3회분. 레오나 대장님, 저희가 선두에 서겠습니다.'],
        ['brownie', '저희 스틸라인이 앞에 서겠슴다! 각하께 가는 길은 저희가 열지 말입니다!'],
        ['leprechaun', '브라우니!! …라고 하고 싶지만 맞는 말이군요. 하아. 각하, 들리십니까. 스틸라인이 선두에 섭니다.'],
        ['leona', '…좋아. 스틸라인이 벽, 발할라가 칼. 사령관은 등대에 그대로 있어. 그건 명령이야.'],
        ['commander', '지휘관은 나다, 레오나.'],
        ['leona', '반나절 자리 비운 지휘관은 좀 들어. 발할라, 스틸라인 뒤에 붙어!'],
        ['khan', '호드 도착. 선제공격이 호드의 방식이지만 오늘은 뒤를 맡지. 다리 입구는 내가 막는다. 이상.'],
        ['brunhild', '흥. 구출극 마지막 장에 늦게 들어오는 지원군. 뻔한 전개네. 뭐, 불타고 싶은 철충이 있으면 나한테 오라고 해.'],
        ['hela', '저, 저 같은 겁쟁이도 왔으니… 다, 다들 괜찮을 거예요… 아마… 으으.'],
        ['gnome', '걱정 마세요, 헬라 씨. 제가 지켜 드릴게요. 오늘은 다 가족이에요.'],
      ],
      outro: [
        ['narr', '얼음 위의 골타리온이 마지막 방어막과 함께 부서졌다. 다리는 지켜졌다. 바리케이드 앞에 선 브라우니의 손은 떨리지 않았다.'],
        ['brownie', '스틸라인 총원! 전투위치… 아, 아니지. 끝났지 말입니다. 각하! 막았슴다! 다리 막았지 말입니다!'],
        ['leprechaun', '적 사살 58체. 분대 사상자 0. 브라우니, 바리케이드 이탈 0회. …잘했습니다. 승리!'],
        ['leona', '…잘했어, 브라우니. 완벽한 나 다음으로.'],
        ['brownie', '헤헤, 레오나 대장님 다음이면 충분함다!'],
        ['gnome', '제가 지켜 드린다고 했잖아요. 가족이니까.'],
        ['leona', '사령관 없이 반나절… 생각보다 길었어. …아무것도 아니야. 등대로 갈게.'],
      ],
      stages: [
        { name: '등대 다리 입구', final: 'elite', lines: [['khan', '다리 입구, 호드가 막는다. 스틸라인, 앞으로. 발할라는 뒤를 보도록. 이상.'], ['brownie', '스틸라인 총원! 전투위치로! 각하께 가는 다리임다!']] },
        { name: '얼어붙은 노면', final: 'elite', lines: [['impet', '노면이 얼었어. 애들아, 뛰지 말고 걸어. 철충은 미끄러져도 우리는 안 미끄러지도록.'], ['nymph', '후훗, 철충이 미끄러지는 건 처음 봐요. 레오나님, 저기 넘어진 거 쏘죠.']] },
        { name: '첫 번째 바리케이드', final: 'elite', lines: [['gnome', '발포 콘크리트, 1회분 사용하겠습니다. 첫 바리케이드 완성이에요.'], ['leona', '좋은 벽이네. 벽 뒤에서 발할라가 벨게. 사령관은 그 벽 뒤보다 더 뒤에 있어.']] },
        { name: '얼음 위의 포식자', final: 'e_Nidhogg_N', lines: [['valkyrie', '니드호그 강화형. 재생 1.3초, 봉인 12초. 각하, 바리케이드 안쪽에 계십시오. 안 됩니다, 나오시면.'], ['leona', '발키리가 저렇게 말할 땐 듣는 게 좋아. 발할라, 재생 못 하게 쉬지 말고 쏴!']] },
        { name: '탄약 수레', final: 'elite', lines: [['leprechaun', '탄약 수레 도착. 발할라, 탄약 보급. 브라우니! 수레 밀면서 쏘지 마십시오!'], ['brownie', '밀면서 쏠 수 있지 말입니다! …죄송함다, 못 하겠슴다.']] },
        { name: '두 번째 바리케이드', final: 'elite', lines: [['gnome', '발포 콘크리트, 2회분. 한 번 남았어요. 다음 벽은… 제가 될게요.'], ['brunhild', '하아… 벽이 되겠다는 대사, 영화에서 열 번은 봤어. 그래도 나쁘지 않네. 불은 내가 붙일게.']] },
        { name: '다리 중앙 교각', final: 'elite', lines: [['hela', '으으… 교각 밑에서 올라와요! 인간님, 저… 마스크, 쓸게요. …그대들, 지옥을 보여 주지.'], ['nymph', '헬라님이 바뀌셨어요! 레오나님, 지금이 기회죠!']] },
        { name: '얼음 위의 방패', final: 'e_Goltarion_N', lines: [['valkyrie', '골타리온 강화형. 방어막 3회, 체력 절반에서 소환. 탄약 잔량 9퍼센트. 막이 설 때는 쏘지 않습니다.'], ['brownie', '탄은 스틸라인에 있슴다! 발할라는 쉬십쇼! 스틸라인 총원, 막이 꺼지면 전탄 발사임다!']] },
      ],
    },
    {
      id: 8, title: '열두 시간째', sub: '오후 6시, 등대 아래 전원 집결', bg: 'assets/bg_plant_void.jpg', cruel: true,
      introBg: 'BG_LightTower', stageBg: 'BG_CoastCity', outroBg: 'BG_Lobby', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오후 6시. 통신 두절 열두 시간째, 등대 아래 옛 변전소. 해가 지고 등대의 불이 켜졌다. 그 아래에 오르카의 모든 부대가 모였다.'],
        ['labiata', '주인님… 무사하셔서… 정말… 콘스탄챠. 넌 나중에 이야기하자.'],
        ['constantia', '네, 언니… 어머, 눈을 그렇게 뜨지 마세요. 무서워요.'],
        ['blacklilith', '주인님! 리리스가 제일 먼저… 아니네요. 콘스탄챠 양이 열두 시간 먼저였네요. 후후… 부러워서 미칠 것 같아요.'],
        ['raven', '꼬맹이. 누나한테 걱정시킨 값은 비싸. 알지?'],
        ['lemonadealpha', '주인님 심박, 지금은 정상으로 보여요. 열두 시간 중 가장 긴장하신 상태예요.'],
        ['commander', '값은 다 낸다. 지금은 적이 온다. 전원 들어라.'],
        ['commander', '열두 시간 동안 너희는 내 명령 없이 싸웠다. 틀린 길로 가고, 책을 믿고, 메기 소리를 틀었다. 그리고 한 명도 잃지 않았다. 그게 오르카다.'],
        ['commander', '마지막 두 시간. 이번엔 같이 간다. 스틸라인이 벽, 발할라가 칼, 리리스가 내 옆. 오르카, 전투 준비!'],
        ['brownie', '스틸라인 총원! 전투위치로! 각하 명령이지 말입니다!'],
        ['leona', '…그 말, 완벽한 나보다 먼저 하다니. 발할라, 돌격!'],
      ],
      outro: [
        ['narr', '등대 아래의 철의 왕자가 마지막 방어막과 함께 무너졌다. 열두 시간 전에 끊긴 통신은, 이제 모두의 통신기에서 같은 목소리로 울렸다.'],
        ['labiata', '주인님이 안 계신 열두 시간, 오르카는 움직였어요. …그래도 다음부터 통신기는 두 개 챙기도록 할게요.'],
        ['constantia', '세 개 챙길게요… 언니. 후후… 죄송해요.'],
        ['brownie', '각하! 스틸라인, 사상자 0임다! 헤헤, 이제 손 안 떨리지 말입니다!'],
        ['leprechaun', '브라우니!! 보고는 선임이… 하아. 맞습니다, 각하. 사상자 0. 승리!'],
        ['leona', '다음에 또 사라지면 완벽한 나도 수색은 안 가. …거짓말이야. 가겠지. 사령관은 그런 걸 알고 있어서 짜증 나.'],
        ['mercury', '본녀의 길잡이 메기도 큰 역할을… 네? 안 했다구요? 그, 그럴 리가!'],
        ['raven', '꼬맹이, 보상은 오늘 밤에 받을게. 누나랑 불꽃놀이. 다른 생각한 거 아니지?'],
        ['commander', '하루 쉬려다 열두 시간을 받았다. 전원, 귀함. 그리고 콘스탄챠. 차는 다음에 배에서 마시지.'],
        ['constantia', '후후… 네, 주인님. 다음엔 언니 몫도 끓일게요.'],
        ['narr', '등대의 불빛 아래로 상륙정이 돌아갔다. 사령관의 하루 휴가는 열두 시간으로 끝났고, 오르카의 모든 부대는 사령관 없이도 싸울 수 있다는 것을 알았다. 물론, 다시는 그러고 싶지 않았지만. (계속)'],
      ],
      stages: [
        { name: '변전소 정문', final: 'elite', lines: [['commander', '변전소 정문. 열두 시간 만의 첫 명령이다. 노움, 벽. 레프리콘, 좌측. 발키리, 우측 저격.'], ['leprechaun', '명령 확인. 좌측 전개. …각하 목소리로 듣는 위치 지시는 역시 다릅니다. 승리!']] },
        { name: '등대 광장', final: 'elite', lines: [['blacklilith', '주인님, 리리스 옆에서 떨어지지 마세요. 광장은 넓어요. 어디서든 올 수 있으니까.'], ['commander', '네 옆에 있다, 리리스. 다른 대원들도 방해가 아니다. 오늘만은 그렇게 생각해라.']] },
        { name: '케이블 트렌치', final: 'elite', lines: [['lemonadealpha', '케이블 트렌치가 적의 진입로예요. 트렌치 양끝만 막으면 되는 것으로 보여요.'], ['sylphid', '양끝? 한쪽은 초 쿨한 내가. 다른 쪽은… 밴시, 할 수 있지?']] },
        { name: '변전소 마당의 어미 새', final: 'e_EmperorChick_N', lines: [['commander', '엠페러 칙 강화형. 소환 두 번, 재생. 새끼가 나오면 머큐리, 티아멧, 범위. 재생은 레이븐이 끊어라.'], ['raven', '오케이, 누나가 끊을게. 하르페이아, 책에 엠페러 칙 약점은 안 나왔지? 그냥 쏘자.']] },
        { name: '등대 계단 아래', final: 'elite', lines: [['constantia', '주인님, 등대 계단이 좁아요. 아침에 제가 올라갔던 길이에요. 여기선 저격이 유리하거든요.'], ['commander', '그럼 네가 올라가라, 콘스탄챠. 열두 시간 동안 봐 둔 사선이 있을 테니.']] },
        { name: '관리소 지붕', final: 'elite', lines: [['harpy', '지붕 위에서 보니까 다 보여! 책이 맞았어, 높은 곳이 최고라구!'], ['hraesvelgr', '하르페이아, 레이더에 지붕 아래 적 접근이군요. 책은 나중에 읽으세요.']] },
        { name: '마지막 바리케이드', final: 'elite', lines: [['gnome', '발포 콘크리트, 마지막 1회분이에요. 사령관님 앞에 세울게요. 걱정 마세요, 제가 지켜 드릴게요.'], ['brownie', '노움 옆은 제가 섭니다! 각하, 앞만 보십쇼! 뒤는 스틸라인이 보지 말입니다!']] },
        { name: '등대 아래의 왕자', final: 'e_IronPrince_N', lines: [['labiata', '철의 왕자 강화형. 소환, 방어막, 봉인, 재생. 전부입니다. 주인님, 제 옆에 붙어 계세요. 낙오자는 없을 거예요. 지금까지처럼요.'], ['commander', '전원 들어라. 열두 시간 동안 너희가 한 것을 두 시간 안에 같이 한다. 막이 꺼지면 전탄, 봉인되면 메우고, 쉬지 않는다. 오르카, 돌격!']] },
      ],
    },
  ];

  const PER_CHAPTER = 8;
  const total = () => CHAPTERS.length * PER_CHAPTER;
  // global stage index (1..64) <-> chapter / stage in chapter
  function at(g) {
    const ci = Math.floor((g - 1) / PER_CHAPTER), si = (g - 1) % PER_CHAPTER;
    const ch = CHAPTERS[ci];
    if (!ch) return null;
    const st = ch.stages[si];
    return { g, chapter: ch, ci, si, stage: st, code: `${ch.id}-${si + 1}`, isBoss: st.final !== 'elite', last: si === PER_CHAPTER - 1 };
  }
  // what WaveSim / Stage need: waves, elite and final waves, the final enemy, the difficulty index and the
  // reward factor (later chapters pay more parts: 1 .. 2.75)
  function plan(g) {
    const a = at(g);
    const cruel = a.stage.cruel != null ? a.stage.cruel : a.chapter.cruel;
    return { g, waves: 8, eliteWave: 4, final: a.stage.final, cruel, bg: a.chapter.bg, code: a.code, partsK: 1 + 0.25 * a.ci };
  }

  const api = { CHAPTERS, PER_CHAPTER, total, at, plan };
  if (typeof module !== 'undefined') module.exports = api; else root.STORY = api;
})(this);
