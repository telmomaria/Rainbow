// Side-effect imports: each file registers its characters with registerFolk().
// The order here is the order in which cities get them (see folkForLevel in folk.ts).
import './elfo'; // I01 (worked example)
import './fantasia'; // I02–I03, I06–I07, I09–I10 (I04 heróis + I05 astronauta + I08 guardião removidos)
import './oficios1'; // I11–I20 (I14 advogado removido)
import './oficios2'; // I21–I30 (I22 carteiro + I26 professor + I29 cantor removidos)
export { FolkTown, folkForLevel, folkIds, type FolkHost } from './folk';
