// Scenario: 8 chapters of 8 stages, each with a short scene before it. Original writing set in the Last Origin world
// (Orca, the commander, the Iron Bugs); no lines are copied from the game.
//
// introBg / stageBg / outroBg: original dialogue backgrounds behind the prologue, the stage scenes and the epilogue
// line: [speaker, text]   speaker = roster unit id (portrait), 'commander' (the player) or 'narr' (narration)
// stage.final: 'elite' (a stage captain) or a boss rig with tricks; stage 4 and 8 of a chapter are boss stages
// stage.cruel: the boss comes "cruel" (one extra trick, harsher numbers); a chapter's `cruel` is the default
//
// Setting rule: Iron Bugs never enter water. The Orca is safe at sea; every fight happens on land, and enemies
// always come from the land side, even on the coast or on a bridge.
//
// The long story: the Orca's reactor core is cracked and has thirty days left. The only spare is on land, in the
// "Ark", the mountain refuge of old humanity. The crew lands on a storm coast (1), holds out in a ruined city (2),
// is hunted across a canyon bridge (3) and steals fuel cells from a factory (4) to reach the Ark, which turns out
// to be empty: the spare core was moved to the coastal power plant long ago, and the Iron Bugs have made that
// plant their nest around it (5). A feint at a foundry (6), the escort of the cooling rig over a frozen canyon (7)
// and the battle inside the nest (8) bring the core home before the last day.
// Leona wants a home on land and clashes with the commander until the Ark; Brownie grows from a rookie into the
// one who holds the front line.
(function (root) {
  const CHAPTERS = [
    {
      id: 1, title: '서른 날', sub: '동력로 코어의 균열, 폭풍 해안에 상륙하다', bg: 'assets/bg_bridge_storm.jpg', cruel: false,
      introBg: 'BG_Lobby', stageBg: 'BG_CliffNight', outroBg: 'BG_Cliff', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '오르카 호는 바다 위에서는 안전했다. 철충은 물에 들어오지 못한다. 하지만 그날 아침, 동력로 코어에 균열이 발견됐다. 알파의 계산으로 남은 시간은 서른 날이었다.'],
        ['lemonadealpha', '코어가 멈추면 배도 멈춰요. 예비 코어는 옛 인류 기록에 딱 한 곳, 대륙 안쪽 산맥의 "방주"에 있어요.'],
        ['commander', '서른 날 안에 육지를 가로질러 방주까지 갔다가 돌아온다. 상륙 부대를 꾸린다.'],
        ['leona', '…육지로 간다고. 사령관, 바다를 떠나는 순간부터 철충은 우리 것이다. 알고 내리는 거겠지.'],
      ],
      outro: [
        ['narr', '절벽의 니드호그가 쓰러지자 해안 도로가 조용해졌다. 폭풍이 걷히고, 바다 위에 정박한 오르카 호가 멀리서 등불처럼 보였다.'],
        ['raven', '교두보 확보. 배는 바다에서 기다려. 돌아올 때까지 저긴 안전해.'],
        ['constantia', '남은 날은 스물일곱. 방주까지는 도시, 대교, 공장 지대를 지나 산맥이에요.'],
        ['commander', '스물일곱 날. 충분하다. 모두 살아서 가는 것이 첫 번째 명령이다.'],
      ],
      stages: [
        { name: '폭풍 속 상륙정', final: 'elite', lines: [['brownie', '사, 상륙정이 도로에 닿았어요! 도로 위에서 철충이 달려와요!'], ['commander', '첫발을 디딘 곳이 교두보다. 브라우니, 네 뒤는 내가 본다. 앞만 봐라.']] },
        { name: '해안 도로의 첫 방어선', final: 'elite', lines: [['gnome', '도로 위에 포를 거치했어요. 육지 쪽에서 오는 건 전부 보여요!'], ['leprechaun', '도로는 길고 좁아. 경기관총에는 최고의 자리지!']] },
        { name: '무너진 요금소', final: 'elite', lines: [['labiata', '요금소 콘크리트가 두껍습니다. 여기서 보급품을 내립니다.'], ['thetis', '들것은 제가 밀어요! 길만 열어 주세요!']] },
        { name: '도로의 성벽', final: 'e_Goltarion_N', lines: [['raven', '도로 한가운데 골타리온이야. 내륙으로 가는 길을 막고 서서 방어막을 펴고 있어.'], ['commander', '저 녀석을 넘지 못하면 상륙은 의미가 없다. 방어막이 걷히는 순간에 전원 집중.']] },
        { name: '보급품 하역장', final: 'elite', lines: [['leona', '하역장에 교두보를 세운다. 발할라, 전열. 사령관, 당신은 뒤에 서 있어라.'], ['commander', '앞에 설지 뒤에 설지는 내가 정한다. 지금은 당신 말이 맞으니 뒤에 선다.']] },
        { name: '폭풍 속 야영지', final: 'elite', lines: [['constantia', '식량 열흘분, 치료기 둘. 폭풍이 그칠 때까지 여기서 버텨야 해요.'], ['brownie', '제, 제가 불침번 설게요. 잠은… 안 와요, 어차피.']] },
        { name: '절벽 아래 길', final: 'elite', lines: [['harpy', '절벽 위에서 철충이 내려다보고 있어요! 바위를 타고 내려와요!'], ['commander', '절벽 쪽에 사거리를 모아라. 내려오는 길목은 하나다.']] },
        { name: '절벽의 포식자', final: 'e_Nidhogg_N', lines: [['tiamat', '니드호그. 절벽 바위 틈에 사는 대형 철충이다. 상처가 금방 아무니 쉬지 말고 쳐라.'], ['commander', '첫 상륙의 마지막 관문이다. 사거리 긴 대원, 한순간도 끊지 마라!']] },
      ],
    },
    {
      id: 2, title: '잿빛 도시의 농성', sub: '폐허 도시에서 열흘을 버틴다', bg: 'assets/bg_city.jpg', cruel: false,
      introBg: 'BG_CoastCity', stageBg: 'BG_Ruin', outroBg: 'BG_Soulworker1', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '해안 도로가 끝나는 곳에 잿빛 도시가 있었다. 절벽에서 부상자가 늘었고, 폭풍으로 배와의 연락도 끊겼다. 일행은 무너진 백화점에 바리케이드를 쌓았다.'],
        ['leona', '서른 날 중 벌써 닷새를 썼다. 걸을 수 있는 대원만 먼저 방주로 보내야 한다.'],
        ['labiata', '부상자를 두고 가자는 말씀입니까. 저는 따를 수 없습니다.'],
        ['commander', '둘 다 옳다. 그러니 아무도 보내지 않고, 아무도 두고 가지 않는다. 열흘 동안 이 도시가 우리 배다.'],
      ],
      outro: [
        ['narr', '엑스큐셔너가 쓰러진 뒤 도시는 조용해졌다. 열흘이 지나 부상자들이 일어섰고, 창고에서 찾은 식량이 수레 넷에 실렸다.'],
        ['brownie', '사령관님, 저… 처음으로 한 레인을 혼자 막았어요. 손은 아직 떨리지만요.'],
        ['commander', '떨리는 손으로도 막았으면 된 거다. 다음엔 두 레인이다.'],
        ['leona', '…열흘을 버텼군. 인정한다. 하지만 사령관, 남은 날은 열일곱이다. 당신의 방식은 느리다.'],
      ],
      stages: [
        { name: '백화점 바리케이드', final: 'elite', lines: [['brownie', '바리케이드 완성! 철충이 진열장 사이로 들어와요!'], ['leprechaun', '좁은 통로야. 경기관총 난사에는 최고의 자리지!']] },
        { name: '옥상 급수탑', final: 'elite', lines: [['nymph', '급수탑에 물이 남아 있어요. 이걸 지키면 열흘은 버텨요.'], ['commander', '물은 피보다 귀하다. 탑 주변에 레인을 세 줄로.']] },
        { name: '약국 거리', final: 'elite', lines: [['daphne', '약국에 나노 젤이 있어요! 부상자한테 꼭 필요해요!'], ['sylphid', '그럼 제가 먼저 날아가서 길을 치울게요. 따라와요!']] },
        { name: '둥지가 된 극장', final: 'e_EmperorChick_N', lines: [['raven', '극장 안이 둥지야. 엠페러 칙이 알을 품고 있어. 우리가 열흘 동안 시끄럽게 군 탓이지.'], ['commander', '둥지를 두고는 열흘을 못 버틴다. 부하가 나오는 순간 범위 공격을 겹쳐라.']] },
        { name: '창고 지구', final: 'elite', lines: [['lrl', '창고에 통조림이 산더미! 수레로 나르자!'], ['amy', '나르는 동안은 제가 저격으로 덮을게요. 서두르세요.']] },
        { name: '무너진 병원', final: 'elite', lines: [['labiata', '병원 지하에서 부상자를 치료하고 있습니다. 이 층만은 절대 넘기지 마세요.'], ['blacklilith', '이 복도는 제가 섭니다. 지나가려면 저를 쓰러뜨려야 할 겁니다.']] },
        { name: '사냥꾼의 발자국', final: 'elite', lines: [['constantia', '이상해요. 철충이 사령관님이 계신 곳만 골라서 와요. 누가 지휘관을 찾고 있어요.'], ['commander', '찾는다면 찾게 해 주지. 내가 미끼가 된다. 레오나, 반대하지 마라.']] },
        { name: '지휘관 사냥', final: 'e_Executioner_EW', lines: [['leona', '엑스큐셔너. 지휘관만 골라 쫓는 사냥꾼이다. 사령관, 당신이 노려지고 있다.'], ['commander', '그래서 내가 앞에 선 거다. 녀석이 나를 보는 동안 화력을 여럿이 나눠 쳐라.']] },
      ],
    },
    {
      id: 3, title: '협곡 대교의 추격', sub: '협곡을 가로지르는 긴 다리, 뒤에서 철충이 쫓아온다', bg: 'assets/bg_bridge.jpg', cruel: false,
      introBg: 'BG_Camp3', stageBg: 'BG_Cliff', outroBg: 'BG_Soulworker4', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '도시를 나서자 철충 무리가 뒤따랐다. 방주로 가는 길은 깊은 협곡을 가로지르는 긴 대교 하나뿐이었고, 다리 위에서는 숨을 곳이 없었다.'],
        ['raven', '뒤쪽 5킬로미터에 큰 무리. 다리 건너편 끝에도 철충이 보여. 앞뒤로 끼이게 돼.'],
        ['commander', '그럼 끼일 곳을 우리가 정한다. 본대는 앞으로, 나는 후미에서 녀석들을 붙든다.'],
        ['labiata', '사령관님을 후미에 두는 건 반대입니다. …하지만 가장 빠른 길인 것도 압니다. 제가 곁에 서겠습니다.'],
      ],
      outro: [
        ['narr', '대교 끝의 골타리온이 무너지자 추격은 멎었다. 다리 건너 녹슨 공장 지대가 보였고, 수레의 연료 전지는 바닥을 보이고 있었다.'],
        ['lemonadealpha', '수레도, 통신기도, 치료기도 전부 전지가 필요해요. 저 공장에서 구하지 못하면 방주까지 못 가요.'],
        ['commander', '공장에 철충이 득시글할 텐데. 남은 날은 열넷이다.'],
        ['lemonadealpha', '그러니까 싸우지 말고 훔쳐요. 조용히요.'],
      ],
      stages: [
        { name: '대교 진입로', final: 'elite', lines: [['harpy', '다리 입구에 벌써 철충이 와 있어요! 앞뒤로 끼었어요!'], ['commander', '앞은 뚫고 뒤는 붙든다. 발할라는 앞, 스틸 라인은 나와 함께 뒤.']] },
        { name: '후미 방어선', final: 'elite', lines: [['brownie', '사령관님, 후미는 제가 맡아도 돼요. 두 레인… 약속했잖아요.'], ['commander', '좋다. 왼쪽 두 레인은 브라우니. 가운데는 나다.']] },
        { name: '끊어진 상판', final: 'elite', lines: [['sylphid', '상판이 끊겼어요! 수레는 철골 위로 넘겨야 해요!'], ['undine', '넘기는 동안 양쪽 끝은 호라이즌이 봐요. 다리 양 끝에서 계속 와요.']] },
        { name: '협곡의 추격자', final: 'e_Nidhogg_N', lines: [['tiamat', '니드호그가 또 있다. 협곡 벼랑을 타고 다리 위로 올라왔다.'], ['commander', '상판 위에서 수레를 지키며 싸운다. 쉬지 않고 쳐야 재생을 못 한다.']] },
        { name: '바람의 교각', final: 'elite', lines: [['banshee', '협곡 바람이 강해서 비행이 흔들려요. 그래도 대공은 제가 합니다.'], ['hraesvelgr', '다리 끝에서 밀고 오는 기동형은 확산 빔으로 밀어낼게요.']] },
        { name: '버려진 검문소', final: 'elite', lines: [['leona', '검문소 콘크리트가 두껍다. 여기서 한 번 더 추격을 끊는다.'], ['commander', '당신 판단이 맞다. 발할라 전열, 검문소를 요새로 쓴다.']] },
        { name: '다리의 마지막 1킬로미터', final: 'elite', lines: [['constantia', '다리 끝이 보여요. 그런데 끝에서 큰 반응이… 막혀 있어요!'], ['commander', '뒤에서 쫓기고 앞이 막혔다. 그럼 앞을 부순다.']] },
        { name: '대교의 봉쇄', final: 'e_Goltarion_N', cruel: true, lines: [['labiata', '골타리온, 그것도 강화형입니다. 방어막이 세 번, 부하까지 부릅니다.'], ['commander', '여기서 못 넘으면 뒤의 무리에 잡힌다. 부하부터 치우고, 방어막이 걷힐 때 전부 쏟아부어라!']] },
      ],
    },
    {
      id: 4, title: '녹슨 공장 잠입', sub: '연료 전지를 훔치기 위한 조용한 작전', bg: 'assets/bg_plant.jpg', cruel: false,
      introBg: 'BG_Soulworker3', stageBg: 'BG_Maintenance01', outroBg: 'BG_Hangar', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '공장 지대는 철충이 스스로를 고치는 정비소였다. 알파의 계획은 단순했다. 들키지 않고 들어가서, 전지를 챙기고, 들키지 않고 나온다.'],
        ['zero', '잠입은 제 일입니다. 소리를 내는 분은 두고 가겠습니다.'],
        ['lemonadealpha', '전지 보관고는 공장 안쪽, 냉각 구역 너머예요. 길은 제가 안내할게요.'],
        ['commander', '들키는 순간까지는 조용히. 들키면 그때부터 내 작전이다. 전원, 경로 암기.'],
      ],
      outro: [
        ['narr', '철의 왕자가 무너진 자리에 전지 상자 스물네 개가 남았다. 공장을 빠져나오며 알파는 뒤를 돌아보았다.'],
        ['lemonadealpha', '이상해요. 이 공장 부품 규격… 동력로 규격이에요. 철충이 어딘가에서 동력로를 돌리고 있어요.'],
        ['raven', '철충이 동력로를 왜.'],
        ['commander', '…방주에 가면 알게 되겠지. 남은 날은 열하나. 전지를 가지고 산을 오른다.'],
      ],
      stages: [
        { name: '울타리 밖', final: 'elite', lines: [['zero', '순찰 철충의 간격은 40초. 그 사이에 울타리를 넘습니다.'], ['brownie', '소리 안 내고 싸우는 법은 없나요… 아, 있네요. 빨리 끝내는 거.']] },
        { name: '폐기물 배관 통로', final: 'elite', lines: [['undine', '배관을 따라가면 냉각 구역이에요. 냄새는 참으세요.'], ['commander', '배관 통로에서는 적이 한 줄로 온다. 앞에 보호기 하나면 충분하다.']] },
        { name: '냉각 구역', final: 'elite', lines: [['titania', '냉각 구역이라더니 제가 더 차갑게 만들어 드릴게요.'], ['lemonadealpha', '티타니아, 배관은 얼리지 마세요! 터지면 전부 들켜요!']] },
        { name: '부화장', final: 'e_EmperorChick_N', cruel: true, lines: [['raven', '잘못 들어왔어. 여긴 부화장이야. 엠페러 칙 강화형이 알을 지켜.'], ['commander', '여기서 들켰다. 그럼 지금부터 내 작전이다. 소환 두 번, 재생 하나. 전원 진형 전개!']] },
        { name: '경보 속의 보관고', final: 'elite', lines: [['lemonadealpha', '경보가 울려요! 보관고까지 300미터, 전지를 꺼내는 데 2분!'], ['commander', '2분이면 두 웨이브다. 보관고 앞을 막는다.']] },
        { name: '컨베이어 위의 후퇴', final: 'elite', lines: [['khan', '컨베이어를 타고 나간다! 반대로 도는 건 신경 쓰지 마!'], ['eternity', '전지 상자는 제가 짊어집니다. 길만 열어 주십시오.']] },
        { name: '막힌 출구', final: 'elite', lines: [['constantia', '출구가 닫혔어요! 공장이 우리를 안에 가두려고 해요!'], ['commander', '가두려는 건 지키려는 게 있다는 뜻이다. 문을 부수고, 뭘 지키는지도 본다.']] },
        { name: '공장의 시제품', final: 'e_IronPrince_N', lines: [['labiata', '철의 왕자… 이 공장이 고치고 있던 것입니다. 소환, 방어막, 봉인을 모두 씁니다.'], ['commander', '전지를 든 대원은 뒤로. 나머지는 지금까지 상대한 모든 기믹을 떠올려라. 돌파한다!']] },
      ],
    },
    {
      id: 5, title: '텅 빈 방주', sub: '산맥의 피난 요새에서 마주한 진실', bg: 'assets/bg_city_dusk.jpg', cruel: true,
      introBg: 'BG_Hallway', stageBg: 'BG_Meeting03', outroBg: 'BG_LightTower', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '산맥을 넘은 일행 앞에 방주가 나타났다. 옛 인류의 피난 요새는 노을 아래 조용히 서 있었다. 문은 열려 있었고, 안에는 아무도 없었다.'],
        ['constantia', '…비어 있어요. 전부. 식량도, 발전기도, 사람도. 수십 년 전에 버려진 거예요.'],
        ['leona', '비어 있으면 우리가 채운다. 여기가 우리의 땅이다. 더는 바다 위를 떠돌지 않아도 된다.'],
        ['commander', '…코어부터 찾는다. 결정은 방주를 다 둘러본 뒤에 한다. 남은 날은 아홉이다.'],
      ],
      outro: [
        ['narr', '엑스큐셔너가 쓰러진 방주의 광장에서 콘스탄챠가 옛 사령부의 마지막 기록을 읽었다. 예비 코어는 방주에 없었다. 전쟁 말기에 해안 발전소로 옮겨진 것이다.'],
        ['raven', '해안 발전소라면 우리가 상륙한 해안 바로 옆이야. 정찰 갔다 왔어. 발전소는 철충의 둥지가 됐고… 코어가 둥지 한가운데서 돌아가고 있어.'],
        ['lemonadealpha', '공장에서 본 동력로 규격 부품, 그게 그 코어에 들어가고 있었던 거예요. 철충이 우리 코어를 자기들 심장으로 쓰고 있어요.'],
        ['commander', '…우리는 코어를 등지고 서른 날 중 스물하루를 걸어온 거군. 남은 날은 아홉. 돌아간다.'],
        ['leona', '사령관. 나는 방주에 남겠다. 아홉 날에 둥지 한가운데로 걸어 들어가 죽는 건 당신 방식이지, 내 방식이 아니다.'],
        ['commander', '막지 않겠다. 하지만 나는 돌아간다. 저 코어가 없으면 오르카는 바다 위의 무덤이 된다.'],
      ],
      stages: [
        { name: '열린 성문', final: 'elite', lines: [['brownie', '문이 열려 있는데 왜 이렇게 불안하죠… 철충이 안에서 나와요!'], ['commander', '빈 요새는 철충의 요새다. 들어가는 게 아니라 되찾는 거다.']] },
        { name: '말라붙은 농장', final: 'elite', lines: [['leona', '농장 구역이다. 물만 끌어오면 다시 쓸 수 있다. 여기서 살 수 있어.'], ['commander', '…우선은 철충부터 치우자. 살 수 있는지는 그다음이다.']] },
        { name: '침묵한 발전실', final: 'elite', lines: [['lemonadealpha', '발전실이 비어 있어요. 코어 거치대만 있고 코어가 없어요. 어디로 간 거죠?'], ['fafnir', '어디든. 지금은 이 어둠 속에서 번개를 좀 치자고.']] },
        { name: '지하 창고의 포식자', final: 'e_Nidhogg_N', cruel: true, lines: [['raven', '지하 창고에 니드호그가 굴을 팠어. 강화형이야. 재생에 봉인까지…'], ['commander', '창고 기록을 못 보면 코어가 어디 갔는지 모른다. 레오나, 당신의 땅을 위해 싸워라. 나도 싸운다.']] },
        { name: '옛 사령부', final: 'elite', lines: [['constantia', '옛 인류의 사령부예요. 마지막 기록이… "코어는 해안 발전소로. 방주는 무덤이다."'], ['commander', '해안 발전소. 우리가 지나온 곳이군.']] },
        { name: '광장의 야영', final: 'elite', lines: [['brownie', '레오나 님, 사령관님… 두 분 다 틀리지 않았잖아요. 왜 싸우세요.'], ['leona', '…틀리지 않아도 둘 다 택할 수는 없다. 브라우니, 네 레인이나 봐라. 셋이다.']] },
        { name: '정찰대 귀환로', final: 'elite', lines: [['raven', '해안 발전소까지 정찰 갔다 올게. 산맥 능선을 타면 하루면 돼.'], ['commander', '돌아오는 길은 우리가 비워 둔다. 반드시 돌아와라.']] },
        { name: '방주의 집행자', final: 'e_Executioner_EW', cruel: true, lines: [['labiata', '엑스큐셔너 강화형. 방주까지 사령관님을 쫓아왔습니다. 둘을 봉인하고 방어막을 폅니다.'], ['commander', '어디까지 쫓아오든 상관없다. 봉인될 대원을 미리 정하고, 나머지가 화력을 지킨다.']] },
      ],
    },
    {
      id: 6, title: '용광로의 양동', sub: '둥지의 주력을 발전소에서 떼어 놓는 속임수', bg: 'assets/bg_plant_red.jpg', cruel: true,
      introBg: 'BG_Soulworker2', stageBg: 'BG_Maintenance02', outroBg: 'BG_Soulworker2', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '해안으로 돌아가는 길목, 산기슭의 용광로 지대에 철충의 정비 공장이 하나 더 있었다. 사령관은 정면으로 발전소에 가지 않기로 했다.'],
        ['commander', '녀석들이 지키는 건 코어다. 우리가 여길 크게 치면 발전소의 주력이 이쪽으로 온다. 그 사이 소수가 협곡을 건너 발전소로 간다.'],
        ['mercury', '즉 우리는 일부러 시끄럽게 지는 척하는 역할이네. 재미있겠는데.'],
        ['brownie', '시끄러운 건 자신 있어요. 지는 척은… 연습할게요.'],
      ],
      outro: [
        ['narr', '엠페러 칙이 용광로에 떨어지자 지대 전체에 경보가 울렸다. 레이븐의 보고대로 발전소에 있던 철충의 절반이 산기슭으로 몰려오고 있었다.'],
        ['mercury', '미끼는 성공. 이제 우리가 도망칠 차례야. 얼어붙은 협곡으로.'],
        ['commander', '코어를 꺼낼 냉각 운반함은 알파의 소수 부대가 먼저 끌고 떠났다. 우리는 녀석들을 끌고 협곡 다리에서 합류한다. 남은 날은 다섯.'],
        ['brownie', '사령관님. 저… 오늘 네 레인을 막았어요. 손도 안 떨렸어요.'],
      ],
      stages: [
        { name: '요란한 입구', final: 'elite', lines: [['gnome', '최대한 시끄럽게! 노움의 포격 쇼 시작합니다!'], ['commander', '잘한다. 더 크게. 발전소에 있는 녀석들까지 듣게.']] },
        { name: '가짜 돌파구', final: 'elite', lines: [['mercury', '여기서 뚫릴 듯 말 듯 하게 싸워. 너무 잘하면 안 돼.'], ['khan', '적당히 싸우는 건 못 배웠는데. 그냥 세게 치고 세게 빠진다!']] },
        { name: '쇳물 위의 다리', final: 'elite', lines: [['brunhild', '쇳물 위 다리다. 떨어지면 끝이니 철충 쪽을 떨어뜨려.'], ['hela', '불길 속의 전투. 버뮤다 팀은 익숙하다.']] },
        { name: '불길 속의 성벽', final: 'e_Goltarion_N', cruel: true, lines: [['raven', '골타리온 강화형이 공장 중심을 막아. 저 녀석을 치면 발전소 쪽 주력이 움직일 거야.'], ['commander', '그럼 제대로 친다. 소환된 부하부터, 방어막이 걷히면 본체. 이번만은 지는 척 없다.']] },
        { name: '전지 창고 폭파', final: 'elite', lines: [['lemonadealpha', '여기 전지를 터뜨리면 공장 전체가 멈춰요. 발전소에서 보일 만큼 큰 불이 날 거예요.'], ['impet', '불이라면 내 전공이지! 기폭은 내가!']] },
        { name: '후퇴 경로 확보', final: 'elite', lines: [['leprechaun', '후퇴 길목에 철충이 먼저 와 있어! 주력이 벌써 움직였나 봐!'], ['commander', '예상보다 빠르다. 좋은 소식이다. 길목을 뚫고 협곡으로 간다.']] },
        { name: '산기슭의 야간 행군', final: 'elite', lines: [['constantia', '뒤에 발전소에서 온 무리가 따라붙었어요. 전부 우리 쪽이에요. 성공이에요!'], ['commander', '성공한 미끼는 살아서 도망쳐야 미끼다. 전열 유지, 협곡으로.']] },
        { name: '화염의 군주', final: 'e_EmperorChick_N', cruel: true, lines: [['labiata', '엠페러 칙 강화형. 발전소에서 온 무리의 선두입니다. 부하를 두 번 부르고 재생합니다.'], ['commander', '녀석을 여기서 떨어뜨리면 둥지는 반쯤 빈다. 브라우니, 왼쪽 네 레인. 믿는다.']] },
      ],
    },
    {
      id: 7, title: '얼어붙은 협곡의 호위', sub: '냉각 운반함을 싣고 얼음 다리를 건넌다', bg: 'assets/bg_bridge_ice.jpg', cruel: true,
      introBg: 'BG_13_5', stageBg: 'BG_13_6', outroBg: 'BG_13_5', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '북쪽 협곡은 얼어 있었다. 옛 연륙교 위로 수레 넷이 나아갔다. 수레에는 공장에서 훔친 전지와, 달아오른 코어를 꺼내 옮길 알파의 냉각 운반함이 실려 있었다.'],
        ['lemonadealpha', '운반함이 깨지면 코어를 꺼내도 옮길 수 없어요. 수레 넷 중 어느 것도 잃으면 안 돼요.'],
        ['commander', '이번 작전은 내가 아니라 수레가 중심이다. 모든 레인은 수레 앞에 선다.'],
        ['narr', '다리 중간, 얼음 위에 익숙한 깃발이 서 있었다. 시스터즈 오브 발할라였다.'],
        ['leona', '…방주는 무덤이라더군. 옛 인류의 말이 맞았다. 사령관, 수레 하나는 우리가 맡는다. 당신 방식으로 가 보자.'],
      ],
      outro: [
        ['narr', '엑스큐셔너가 얼음 위에 쓰러졌다. 협곡 너머 해안에, 보랏빛으로 빛나는 발전소가 보였다. 그 안에서 오르카의 코어가 철충의 심장으로 뛰고 있었다.'],
        ['leona', '저게 우리 코어라고. …돌려받자. 그 뒤에 땅이든 바다든 정하면 된다.'],
        ['commander', '동의한다. 전지 스물네 개, 운반함 하나, 수레 넷. 전부 왔다. 남은 날은 둘. 마지막은 저 둥지 안이다.'],
        ['brownie', '스틸 라인, 전원 이상 없음. 사령관님, 이번엔 제가 앞줄에 설게요.'],
      ],
      stages: [
        { name: '얼음 다리의 첫걸음', final: 'elite', lines: [['undine', '얼음이 수레 무게를 버텨요. 하지만 다리 양 끝에서 철충이 몰려와요!'], ['commander', '수레 앞에 보호기. 양 끝은 원거리가 본다.']] },
        { name: '수레 넷의 대열', final: 'elite', lines: [['leona', '발할라는 두 번째 수레. 사령관, 첫 번째는 당신이다.'], ['commander', '세 번째는 스틸 라인, 네 번째는 라비아타. 대열을 끊기지 않게.']] },
        { name: '눈보라의 교각', final: 'elite', lines: [['sylphid', '눈보라예요! 시야가 없어요! 레이더만 믿고 쏠게요!'], ['hraesvelgr', '위에서 오는 건 전부 내가 막아요. 앞만 보세요.']] },
        { name: '얼음 둥지의 군주', final: 'e_EmperorChick_N', cruel: true, lines: [['raven', '다리 위에 얼어붙은 트럭 행렬 속에 엠페러 칙이 둥지를 틀었어. 수레가 지나가려면 깨워야 해.'], ['commander', '수레를 멈추고 싸운다. 소환이 끝날 때 범위 공격, 재생 전에 끝낸다.']] },
        { name: '갈라진 얼음', final: 'elite', lines: [['thetis', '얼음이 갈라져요! 세 번째 수레가 기울어요!'], ['brownie', '제가 잡을게요! 스틸 라인, 수레를 밀어! 레인은 제가 막아요!']] },
        { name: '관측소 폐허', final: 'elite', lines: [['constantia', '옛 관측소예요. 여기서 하룻밤 쉬면 협곡 끝까지 한 번에 갈 수 있어요.'], ['leona', '밤은 발할라가 지킨다. 사령관, 당신은 자라. 그건 명령이다.']] },
        { name: '협곡의 마지막 교각', final: 'elite', lines: [['lemonadealpha', '운반함이 무사해요. 교각 하나만 더 넘으면 해안이에요.'], ['commander', '마지막 교각에서 녀석이 기다릴 거다. 지휘관을 쫓는 그 녀석.']] },
        { name: '얼음 위의 집행자', final: 'e_Executioner_EW', cruel: true, lines: [['labiata', '엑스큐셔너 강화형. 세 번째입니다. 끝까지 사령관님을 쫓아왔습니다.'], ['commander', '세 번째면 충분히 배웠다. 봉인당할 대원은 정해졌다. 나머지는 흔들리지 마라.']] },
      ],
    },
    {
      id: 8, title: '둥지의 심장', sub: '해안 발전소에서 코어를 되찾는 마지막 날', bg: 'assets/bg_plant_void.jpg', cruel: true,
      introBg: 'BG_HoleLight', stageBg: 'BG_SubmarineHangar', outroBg: 'BG_Lobby', // dialogue backgrounds (assets/story/bg, tools/build_story_art.py)
      intro: [
        ['narr', '해안 발전소의 내부는 보랏빛 비상등과 철충의 조직으로 뒤덮여 있었다. 그 한가운데에서 오르카의 예비 코어가 철충의 심장이 되어 뛰고 있었다. 남은 날은 하루였다.'],
        ['lemonadealpha', '코어를 꺼내려면 터빈 홀 안쪽 제어실까지 가야 해요. 꺼내서 운반함에 넣는 데 1분이면 돼요.'],
        ['leona', '발할라는 동쪽 통로. 사령관, 당신은 중앙. 서로의 뒤는 보지 말자. 각자 앞만 본다.'],
        ['commander', '전원 들어라. 저 코어는 오르카의 심장이다. 복도 하나, 격벽 하나까지 전부 되찾는다. 오르카, 돌격!'],
      ],
      outro: [
        ['narr', '코어를 품은 철의 왕자가 무너지자 알파가 코어를 운반함에 옮겼다. 발전소의 보랏빛이 꺼졌다. 서른 번째 날 새벽, 상륙정이 바다 위의 오르카 호로 향했다.'],
        ['constantia', '코어 교체 완료… 동력로 재가동… 사령관님, 오르카가 다시 뛰어요!'],
        ['brownie', '스틸 라인 전원 무사. 사령관님, 다음 상륙은 제가 앞줄에서 열겠습니다. 손, 안 떨려요.'],
        ['leona', '…땅은 무덤이었고, 발전소는 둥지였다. 그래도 돌려받은 건 배의 심장이다. 당분간은 바다 위에서 당신 방식을 따르지.'],
        ['commander', '당분간이면 충분하다. 전원 수고했다. 오르카 호, 출항한다.'],
        ['narr', '해가 뜨는 바다로 오르카 호가 나아갔다. 육지의 지도에는 아직 붉은 점이 수없이 남아 있었지만, 이번에는 서른 날이 아니라 얼마든지 기다릴 수 있는 배가 있었다. (계속)'],
      ],
      stages: [
        { name: '발전소 정문 돌파', final: 'elite', lines: [['labiata', '정문입니다. 상륙 첫날 지나쳤던 문을, 오늘은 부수고 들어갑니다.'], ['commander', '첫 전투가 제일 중요하다. 교두보를 확보해라.']] },
        { name: '동쪽 통로', final: 'elite', lines: [['leona', '동쪽 통로, 발할라 진입. 사령관, 중앙은 어떤가.'], ['commander', '밀고 있다. 서로의 뒤는 안 본다고 했지. 앞만 본다.']] },
        { name: '변전실의 둥지', final: 'elite', lines: [['harpy', '변전실이 둥지예요! 알이 가득해요!'], ['commander', '둥지째 태운다. 코어로 가는 전력을 끊어라.']] },
        { name: '터빈 홀의 포식자', final: 'e_Nidhogg_N', cruel: true, lines: [['tiamat', '니드호그. 절벽에서 만난 녀석의 동족이 터빈 홀에 자리 잡았다. 강화형이다.'], ['commander', '여기서 첫날의 빚을 갚는다. 쉬지 말고 쳐라. 봉인된 대원은 잊고 남은 화력으로 밀어붙인다.']] },
        { name: '냉각수 배관 복도', final: 'elite', lines: [['lrl', '배관이 전부 철충 조직으로 막혔어! 코어가 과열되고 있어!'], ['brownie', '배관은 제가 뚫을게요. 다섯 레인, 갑니다!']] },
        { name: '중앙 관제실', final: 'elite', lines: [['constantia', '관제실이에요. 코어 상태가… 아직 멀쩡해요. 꺼낼 수 있어요!'], ['commander', '치운다. 그리고 여기서 코어 적출을 시작한다.']] },
        { name: '제어실 앞 격벽', final: 'elite', lines: [['lemonadealpha', '제어실 격벽 앞이에요. 너머에서 코어 박동이 들려요. 꺼내는 데 1분이면 돼요.'], ['blacklilith', '그 1분, 제가 삽니다. 한 마리도 격벽을 넘지 못합니다.']] },
        { name: '코어를 품은 것', final: 'e_IronPrince_N', cruel: true, lines: [['labiata', '철의 왕자 강화형. 오르카의 코어를 제 몸에 연결했습니다. 소환, 방어막, 봉인, 재생. 전부입니다.'], ['commander', '녀석은 우리 배의 심장을 훔쳤다. 돌려받는다. 레오나, 브라우니, 전원. 오르카의 모든 것을 걸고 돌격!']] },
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
