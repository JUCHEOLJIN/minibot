#!/usr/bin/env bash
set -euo pipefail

# ─── 색상 ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── 경로 ────────────────────────────────────────────────────────────────────
MINI_BOT_HOME="$HOME/.mini-bot"
BOT_DIR="$MINI_BOT_HOME/bot"
SKILLS_DIR="$MINI_BOT_HOME/skills"
ENV_FILE="$BOT_DIR/.env"
LOG_FILE="$MINI_BOT_HOME/mini-bot.log"

# GitHub 레포 주소 (배포 시 수정)
REPO_URL="https://github.com/JUCHEOLJIN/minibot.git"

# ─── 헬퍼 ────────────────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${BOLD}${CYAN}"
  echo "  ███╗   ███╗██╗███╗   ██╗██╗      ██████╗  ██████╗ ████████╗"
  echo "  ████╗ ████║██║████╗  ██║██║      ██╔══██╗██╔═══██╗╚══██╔══╝"
  echo "  ██╔████╔██║██║██╔██╗ ██║██║█████╗██████╔╝██║   ██║   ██║   "
  echo "  ██║╚██╔╝██║██║██║╚██╗██║██║╚════╝██╔══██╗██║   ██║   ██║   "
  echo "  ██║ ╚═╝ ██║██║██║ ╚████║██║      ██████╔╝╚██████╔╝   ██║   "
  echo "  ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝      ╚═════╝  ╚═════╝    ╚═╝   "
  echo -e "${NC}"
  echo -e "  ${DIM}스킬 없이 시작하는 확장형 Slack AI 봇${NC}"
  echo ""
}

step() {
  echo -e "\n${BOLD}${BLUE}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"
}

ok() {
  echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC}  $1"
}

fail() {
  echo -e "\n  ${RED}✗ 오류: $1${NC}\n"
  exit 1
}

# curl | bash 로 실행될 때 read 입력을 받기 위해 /dev/tty 사용
ask() {
  local prompt="$1"
  local var_name="$2"
  local secret="${3:-false}"

  echo -ne "  ${CYAN}?${NC} ${BOLD}${prompt}${NC} "

  if [ "$secret" = "true" ]; then
    IFS= read -rs value </dev/tty
    echo ""
  else
    IFS= read -r value </dev/tty
  fi

  eval "$var_name=\"\$value\""
}

ask_yn() {
  local prompt="$1"
  local default="${2:-n}"
  local var_name="$3"

  if [ "$default" = "y" ]; then
    echo -ne "  ${CYAN}?${NC} ${BOLD}${prompt}${NC} ${DIM}[Y/n]${NC} "
  else
    echo -ne "  ${CYAN}?${NC} ${BOLD}${prompt}${NC} ${DIM}[y/N]${NC} "
  fi

  IFS= read -r answer </dev/tty
  answer="${answer:-$default}"

  if [[ "$answer" =~ ^[Yy]$ ]]; then
    eval "$var_name=true"
  else
    eval "$var_name=false"
  fi
}

TOTAL_STEPS=7

# ─── 시작 ────────────────────────────────────────────────────────────────────
print_banner

echo -e "  설치 위치: ${DIM}${BOT_DIR}${NC}"
echo -e "  스킬 위치: ${DIM}${SKILLS_DIR}${NC}"
echo ""

# ─── Step 1: 사전 조건 확인 ────────────────────────────────────────────────
step 1 "사전 조건 확인"

# Node.js 확인
if ! command -v node &>/dev/null; then
  fail "Node.js가 설치되어 있지 않습니다.\n\n  설치 방법:\n  - https://nodejs.org (v18 이상)\n  - 또는 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18 이상이 필요합니다. 현재: $(node --version)"
fi
ok "Node.js $(node --version)"

# npm 확인
if ! command -v npm &>/dev/null; then
  fail "npm이 설치되어 있지 않습니다. Node.js와 함께 설치됩니다."
fi
ok "npm $(npm --version)"

# git 확인
if ! command -v git &>/dev/null; then
  fail "git이 설치되어 있지 않습니다.\n  macOS: xcode-select --install\n  Linux: sudo apt install git"
fi
ok "git $(git --version | cut -d' ' -f3)"

# claude CLI 확인
if ! command -v claude &>/dev/null; then
  warn "claude CLI가 설치되어 있지 않습니다."
  echo  ""
  echo  "  mini-bot은 Claude Code CLI가 필요합니다."
  echo  "  설치: npm install -g @anthropic-ai/claude-code"
  echo  ""
  ask_yn "지금 설치할까요?" "y" DO_INSTALL_CLAUDE
  if [ "$DO_INSTALL_CLAUDE" = "true" ]; then
    echo -e "\n  ${DIM}npm install -g @anthropic-ai/claude-code${NC}"
    npm install -g @anthropic-ai/claude-code
    ok "claude CLI 설치 완료"
  else
    warn "나중에 설치 후 다시 실행하세요: npm install -g @anthropic-ai/claude-code"
  fi
else
  ok "claude $(claude --version 2>/dev/null | head -1 || echo '(버전 확인 불가)')"
fi

# ─── Step 2: 봇 다운로드 ───────────────────────────────────────────────────
step 2 "mini-bot 다운로드"

mkdir -p "$MINI_BOT_HOME"

if [ -d "$BOT_DIR/.git" ]; then
  warn "기존 설치가 발견되었습니다 — 최신 버전으로 업데이트합니다."
  git -C "$BOT_DIR" pull --quiet
  ok "업데이트 완료"
elif [ -d "$BOT_DIR" ]; then
  warn "기존 디렉토리가 있지만 git 레포가 아닙니다."
  ask_yn "덮어쓸까요? (기존 설정은 백업됩니다)" "n" DO_OVERWRITE
  if [ "$DO_OVERWRITE" = "true" ]; then
    cp "$ENV_FILE" "$MINI_BOT_HOME/.env.backup" 2>/dev/null && ok ".env 백업: $MINI_BOT_HOME/.env.backup" || true
    rm -rf "$BOT_DIR"
    git clone --quiet "$REPO_URL" "$BOT_DIR"
    ok "다운로드 완료"
  else
    fail "설치를 취소했습니다."
  fi
else
  echo -e "  ${DIM}git clone $REPO_URL${NC}"
  git clone --quiet "$REPO_URL" "$BOT_DIR"
  ok "다운로드 완료: $BOT_DIR"
fi

# 사용자 스킬 디렉토리 생성
mkdir -p "$SKILLS_DIR"
ok "스킬 디렉토리: $SKILLS_DIR"

# ─── Step 3: 의존성 설치 ──────────────────────────────────────────────────
step 3 "의존성 설치"

echo -e "  ${DIM}npm install...${NC}"
npm install --silent --prefix "$BOT_DIR"
ok "패키지 설치 완료"

# ─── Step 4: Slack 설정 ───────────────────────────────────────────────────
step 4 "Slack 토큰 설정"

# 기존 .env가 있으면 재사용 여부 확인
if [ -f "$ENV_FILE" ]; then
  warn "기존 설정 파일이 있습니다: $ENV_FILE"
  ask_yn "기존 설정을 유지할까요?" "y" KEEP_ENV
  if [ "$KEEP_ENV" = "true" ]; then
    ok "기존 설정 유지"
    SKIP_ENV=true
  else
    SKIP_ENV=false
  fi
else
  SKIP_ENV=false
fi

if [ "$SKIP_ENV" = "false" ]; then
  echo ""
  echo -e "  ${DIM}Slack 앱 설정이 없다면 https://api.slack.com/apps 에서 생성하세요.${NC}"
  echo ""

  ask "Slack Bot Token (xoxb-...)" SLACK_BOT_TOKEN true
  [ -z "$SLACK_BOT_TOKEN" ] && fail "SLACK_BOT_TOKEN은 필수입니다."

  ask "Slack Signing Secret" SLACK_SIGNING_SECRET true
  [ -z "$SLACK_SIGNING_SECRET" ] && fail "SLACK_SIGNING_SECRET은 필수입니다."

  ask "Slack App Token (xapp-...)" SLACK_APP_TOKEN true
  [ -z "$SLACK_APP_TOKEN" ] && fail "SLACK_APP_TOKEN은 필수입니다."

  ask "내 Slack User ID (U0XXXXXXX)" MY_SLACK_USER_ID
  [ -z "$MY_SLACK_USER_ID" ] && fail "MY_SLACK_USER_ID는 필수입니다."

  echo ""
  ask "스케줄 알림 채널 ID (비워두면 DM 전송)" TARGET_CHANNEL

  # .env 생성
  cat > "$ENV_FILE" <<EOF
# mini-bot 설정
# 생성일: $(date)

SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET
SLACK_APP_TOKEN=$SLACK_APP_TOKEN
MY_SLACK_USER_ID=$MY_SLACK_USER_ID
EOF

  if [ -n "$TARGET_CHANNEL" ]; then
    echo "TARGET_CHANNEL=$TARGET_CHANNEL" >> "$ENV_FILE"
  fi

  chmod 600 "$ENV_FILE"
  ok ".env 생성 완료"
fi

# ─── Step 5: CLI 설치 ────────────────────────────────────────────────────
step 5 "mini-bot 명령어 설치"

CLI_SCRIPT="$BOT_DIR/bin/mini-bot"
chmod +x "$CLI_SCRIPT"

# 설치 위치 결정: /usr/local/bin 우선, 안 되면 ~/.local/bin
if [ -w "/usr/local/bin" ]; then
  CLI_TARGET="/usr/local/bin/mini-bot"
  ln -sf "$CLI_SCRIPT" "$CLI_TARGET"
  ok "mini-bot 명령어 설치됨: $CLI_TARGET"
else
  CLI_DIR="$HOME/.local/bin"
  mkdir -p "$CLI_DIR"
  ln -sf "$CLI_SCRIPT" "$CLI_DIR/mini-bot"
  ok "mini-bot 명령어 설치됨: $CLI_DIR/mini-bot"

  # PATH에 없으면 안내
  if ! echo "$PATH" | grep -q "$CLI_DIR"; then
    warn "PATH에 $CLI_DIR 를 추가하세요:"
    echo ""
    echo '    echo '"'"'export PATH="$HOME/.local/bin:$PATH"'"'"' >> ~/.zshrc'
    echo "    source ~/.zshrc"
    echo ""
  fi
fi

# ─── Step 6: 자동 시작 설정 (선택) ──────────────────────────────────────
step 6 "자동 시작 설정 (선택)"

OS_TYPE="$(uname -s)"

if [ "$OS_TYPE" = "Darwin" ]; then
  # macOS: launchd
  ask_yn "macOS 시작 시 자동으로 실행할까요? (launchd)" "y" SETUP_LAUNCHD

  if [ "$SETUP_LAUNCHD" = "true" ]; then
    PLIST_PATH="$HOME/Library/LaunchAgents/com.mini-bot.plist"
    NODE_PATH="$(command -v node)"
    TS_NODE_PATH="$BOT_DIR/node_modules/.bin/ts-node"

    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mini-bot</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$TS_NODE_PATH</string>
    <string>$BOT_DIR/src/index.ts</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$BOT_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>

  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

    # 기존 launchd 서비스 정리 후 재등록
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"
    ok "launchd 등록 완료 → 재부팅 시 자동 시작"
    ok "로그: $LOG_FILE"
  else
    warn "자동 시작 건너뜀 — 수동 실행: mini-bot start"
  fi

elif [ "$OS_TYPE" = "Linux" ]; then
  # Linux: systemd 또는 pm2
  if command -v pm2 &>/dev/null; then
    ask_yn "pm2로 백그라운드 실행할까요?" "y" SETUP_PM2
    if [ "$SETUP_PM2" = "true" ]; then
      pm2 start npm --name mini-bot -- start --prefix "$BOT_DIR"
      pm2 save
      ok "pm2 등록 완료"
      ok "로그: pm2 logs mini-bot"
    fi
  else
    warn "pm2가 없습니다. 자동 시작을 원하면: npm install -g pm2"
  fi
fi

# ─── Step 7: 완료 ─────────────────────────────────────────────────────────
step 7 "완료"

echo ""
echo -e "${BOLD}${GREEN}  ✓ mini-bot 설치 완료!${NC}"
echo ""
echo -e "  ${BOLD}설치 위치${NC}"
echo -e "  ${DIM}봇${NC}    $BOT_DIR"
echo -e "  ${DIM}스킬${NC}  $SKILLS_DIR"
echo -e "  ${DIM}설정${NC}  $ENV_FILE"
echo ""
echo -e "  ${BOLD}명령어${NC}"
echo -e "  ${CYAN}mini-bot start${NC}      포그라운드 실행"
echo -e "  ${CYAN}mini-bot start -d${NC}   백그라운드 실행"
echo -e "  ${CYAN}mini-bot stop${NC}       중지"
echo -e "  ${CYAN}mini-bot restart${NC}    재시작"
echo -e "  ${CYAN}mini-bot status${NC}     상태 확인"
echo -e "  ${CYAN}mini-bot logs${NC}       실시간 로그"
echo -e "  ${CYAN}mini-bot update${NC}     최신 버전으로 업데이트"
echo ""
echo -e "  ${BOLD}스킬 추가 (Slack에서)${NC}"
echo -e "  ${DIM}→ \"날씨 알림 스킬 만들어줘\"${NC}"
echo -e "  ${DIM}→ \"스킬 새로고침\"${NC}"
echo ""
echo -e "  ${DIM}문서: $BOT_DIR/README.md${NC}"
echo ""
