import { expect } from "chai";
import { ethers } from "hardhat";
import { prepareInputs, publishState } from "../../utils/state-utils";
import { DeployHelper } from "../../../helpers/DeployHelper";

const tenYears = 315360000;
const testCases: any[] = [
  {
    name: "Validate Genesis User State. Issuer Claim IdenState is in Chain. Revocation State is in Chain",
    stateTransitions: [require("../common-data/issuer_genesis_state.json")],
    proofJson: require("./data/valid_mtp_user_genesis.json"),
    setProofExpiration: tenYears,
  },
  {
    name: "Validation of proof failed",
    stateTransitions: [require("../common-data/issuer_genesis_state.json")],
    proofJson: require("./data/invalid_mtp_user_genesis.json"),
    errorMessage: "",
    setProofExpiration: tenYears,
  },
  {
    name: "User state is not genesis but latest",
    stateTransitions: [
      require("../common-data/issuer_genesis_state.json"),
      require("../common-data/user_state_transition.json"),
    ],
    proofJson: require("./data/valid_mtp_user_non_genesis.json"),
    setProofExpiration: tenYears,
  },
  {
    name: "The non-revocation issuer state is not expired (is not too old)",
    stateTransitions: [
      require("../common-data/issuer_genesis_state.json"),
      require("../common-data/user_state_transition.json"),
      require("../common-data/issuer_next_state_transition.json"),
    ],
    proofJson: require("./data/valid_mtp_user_non_genesis.json"),
    setProofExpiration: tenYears,
  },
  {
    name: "The non-revocation issuer state is expired (old enough)",
    stateTransitions: [
      require("../common-data/issuer_genesis_state.json"),
      require("../common-data/user_state_transition.json"),
      require("../common-data/issuer_next_state_transition.json"),
    ],
    proofJson: require("./data/valid_mtp_user_non_genesis.json"),
    setExpiration: 1,
    errorMessage: "Non-Revocation state of Issuer expired",
    setProofExpiration: tenYears,
  },
  {
    name: "The generated proof is expired (old enough)",
    stateTransitions: [
      require("../common-data/issuer_genesis_state.json"),
      require("../common-data/user_state_transition.json"),
      require("../common-data/issuer_next_state_transition.json"),
    ],
    proofJson: require("./data/valid_mtp_user_non_genesis.json"),
    errorMessage: "Generated proof is outdated",
  },
];

describe("Atomic MTP Validator", function () {
  let state: any, mtpValidator: any;

  beforeEach(async () => {
    const deployHelper = await DeployHelper.initialize(null, true);

    const contracts = await deployHelper.deployValidatorContracts(
      "VerifierMTPWrapper",
      "CredentialAtomicQueryMTPValidator"
    );
    state = contracts.state;
    mtpValidator = contracts.validator;
  });

  for (const test of testCases) {
    it(test.name, async () => {
      for (const json of test.stateTransitions) {
        await publishState(state, json);
      }

      const query = {
        schema: ethers.BigNumber.from("180410020913331409885634153623124536270"),
        claimPathKey: ethers.BigNumber.from(
          "8566939875427719562376598811066985304309117528846759529734201066483458512800"
        ),
        operator: ethers.BigNumber.from(1),
        value: [
          "1420070400000000000",
          ...new Array(63).fill("0").map((x) => ethers.BigNumber.from(x)),
        ],
        queryHash: ethers.BigNumber.from(
          "1496222740463292783938163206931059379817846775593932664024082849882751356658"
        ),
        circuitId: "credentialAtomicQueryMTPV2OnChain",
      };

      const { inputs, pi_a, pi_b, pi_c } = prepareInputs(test.proofJson);
      if (test.setProofExpiration) {
        await mtpValidator.setProofGenerationExpirationTime(test.setProofExpiration);
      }
      if (test.setExpiration) {
        await mtpValidator.setRevocationStateExpirationTime(test.setExpiration);
      }
      if (test.errorMessage) {
        await expect(mtpValidator.verify(inputs, pi_a, pi_b, pi_c, query.queryHash)).to.be.revertedWith(
          test.errorMessage
        );
      } else if (test.errorMessage === "") {
        await expect(mtpValidator.verify(inputs, pi_a, pi_b, pi_c, query.queryHash)).to.be.reverted;
      } else {
        const verified = await mtpValidator.verify(inputs, pi_a, pi_b, pi_c, query.queryHash);
        expect(verified).to.be.true;
      }
    });
  }
});
