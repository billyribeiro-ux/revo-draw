import {
  COLOR_CHARCOAL_BLACK,
  COLOR_VOICE_CALL,
  COLOR_WHITE,
  THEME,
  UserIdleState,
} from "@excalidraw/common";

import { roundRect } from "./renderer/roundRect";

import type { InteractiveCanvasRenderConfig } from "./scene/types";
import type {
  Collaborator,
  InteractiveCanvasAppState,
  SocketId,
} from "./types";

function hashToInteger(id: string) {
  let hash = 0;
  if (id.length === 0) {
    return hash;
  }
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }
  return hash;
}

export const getClientColor = (
  socketId: SocketId,
  collaborator: Collaborator | undefined,
) => {
  const hash = Math.abs(hashToInteger(collaborator?.id || socketId));
  const hue = (hash % 37) * 10;
  const saturation = 100;
  const lightness = 83;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const getNameInitial = (name?: string | null) => {
  const firstCodePoint = name?.trim()?.codePointAt(0);
  return (
    firstCodePoint ? String.fromCodePoint(firstCodePoint) : "?"
  ).toUpperCase();
};

export const renderRemoteCursors = ({
  context,
  renderConfig,
  appState,
  normalizedWidth,
  normalizedHeight,
}: {
  context: CanvasRenderingContext2D;
  renderConfig: InteractiveCanvasRenderConfig;
  appState: InteractiveCanvasAppState;
  normalizedWidth: number;
  normalizedHeight: number;
}) => {
  for (const [socketId, pointer] of renderConfig.remotePointerViewportCoords) {
    let { x, y } = pointer;

    const collaborator = appState.collaborators.get(socketId);

    x -= appState.offsetLeft;
    y -= appState.offsetTop;

    const width = 11;
    const height = 14;

    const isOutOfBounds =
      x < 0 ||
      x > normalizedWidth - width ||
      y < 0 ||
      y > normalizedHeight - height;

    x = Math.max(x, 0);
    x = Math.min(x, normalizedWidth - width);
    y = Math.max(y, 0);
    y = Math.min(y, normalizedHeight - height);

    const background = getClientColor(socketId, collaborator);

    context.save();
    context.strokeStyle = background;
    context.fillStyle = background;

    const userState = renderConfig.remotePointerUserStates.get(socketId);
    const isInactive =
      isOutOfBounds ||
      userState === UserIdleState.IDLE ||
      userState === UserIdleState.AWAY;

    if (isInactive) {
      context.globalAlpha = 0.3;
    }

    if (renderConfig.remotePointerButton.get(socketId) === "down") {
      context.beginPath();
      context.arc(x, y, 15, 0, 2 * Math.PI, false);
      context.lineWidth = 3;
      context.strokeStyle = "#ffffff88";
      context.stroke();
      context.closePath();

      context.beginPath();
      context.arc(x, y, 15, 0, 2 * Math.PI, false);
      context.lineWidth = 1;
      context.strokeStyle = background;
      context.stroke();
      context.closePath();
    }

    const isSpeakingColor =
      appState.theme === THEME.DARK ? "#2f6330" : COLOR_VOICE_CALL;

    const isSpeaking = collaborator?.isSpeaking;

    if (isSpeaking) {
      context.fillStyle = isSpeakingColor;
      context.strokeStyle = isSpeakingColor;
      context.lineWidth = 10;
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 0, y + 14);
      context.lineTo(x + 4, y + 9);
      context.lineTo(x + 11, y + 8);
      context.closePath();
      context.stroke();
      context.fill();
    }

    context.fillStyle = COLOR_WHITE;
    context.strokeStyle = COLOR_WHITE;
    context.lineWidth = 6;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0, y + 14);
    context.lineTo(x + 4, y + 9);
    context.lineTo(x + 11, y + 8);
    context.closePath();
    context.stroke();
    context.fill();

    context.fillStyle = background;
    context.strokeStyle = background;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.beginPath();
    if (isInactive) {
      context.moveTo(x - 1, y - 1);
      context.lineTo(x - 1, y + 15);
      context.lineTo(x + 5, y + 10);
      context.lineTo(x + 12, y + 9);
      context.closePath();
      context.fill();
    } else {
      context.moveTo(x, y);
      context.lineTo(x + 0, y + 14);
      context.lineTo(x + 4, y + 9);
      context.lineTo(x + 11, y + 8);
      context.closePath();
      context.fill();
      context.stroke();
    }

    const username = renderConfig.remotePointerUsernames.get(socketId) || "";

    if (!isOutOfBounds && username) {
      context.font = "600 12px sans-serif";

      const offsetX = (isSpeaking ? x + 0 : x) + width / 2;
      const offsetY = (isSpeaking ? y + 0 : y) + height + 2;
      const paddingHorizontal = 5;
      const paddingVertical = 3;
      const measure = context.measureText(username);
      const measureHeight =
        measure.actualBoundingBoxDescent + measure.actualBoundingBoxAscent;
      const finalHeight = Math.max(measureHeight, 12);

      const boxX = offsetX - 1;
      const boxY = offsetY - 1;
      const boxWidth = measure.width + 2 + paddingHorizontal * 2 + 2;
      const boxHeight = finalHeight + 2 + paddingVertical * 2 + 2;
      if (context.roundRect) {
        context.beginPath();
        context.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
        context.fillStyle = background;
        context.fill();
        context.strokeStyle = COLOR_WHITE;
        context.stroke();

        if (isSpeaking) {
          context.beginPath();
          context.roundRect(boxX - 2, boxY - 2, boxWidth + 4, boxHeight + 4, 8);
          context.strokeStyle = isSpeakingColor;
          context.stroke();
        }
      } else {
        roundRect(context, boxX, boxY, boxWidth, boxHeight, 8, COLOR_WHITE);
      }
      context.fillStyle = COLOR_CHARCOAL_BLACK;

      context.fillText(
        username,
        offsetX + paddingHorizontal + 1,
        offsetY +
          paddingVertical +
          measure.actualBoundingBoxAscent +
          Math.floor((finalHeight - measureHeight) / 2) +
          2,
      );

      if (isSpeaking) {
        context.fillStyle = isSpeakingColor;
        const barHeight = 8;
        const margin = 8;
        const gap = 5;
        context.fillRect(
          boxX + boxWidth + margin,
          boxY + (boxHeight / 2 - barHeight / 2),
          2,
          barHeight,
        );
        context.fillRect(
          boxX + boxWidth + margin + gap,
          boxY + (boxHeight / 2 - (barHeight * 2) / 2),
          2,
          barHeight * 2,
        );
        context.fillRect(
          boxX + boxWidth + margin + gap * 2,
          boxY + (boxHeight / 2 - barHeight / 2),
          2,
          barHeight,
        );
      }
    }

    context.restore();
    context.closePath();
  }
};
